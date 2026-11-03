"""Opponent scouting: pull a player's public game history from Lichess or
chess.com, classify every game by opening, and surface where they actually
lose points -- the same idea as ChessRep's opponent prep, built on top of
our own opening tree instead of a paid API.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Dict, List, Optional

import chess
import chess.pgn
import httpx

from .openings import get_book

USER_AGENT = "chess-coach/1.0 (personal project; contact via github)"

LICHESS_GAMES_URL = "https://lichess.org/api/games/user/{username}"
CHESSCOM_ARCHIVES_URL = "https://api.chess.com/pub/player/{username}/games/archives"


class ScoutingError(Exception):
    pass


def fetch_lichess_pgns(username: str, max_games: int = 100, timeout: float = 30.0) -> List[str]:
    url = LICHESS_GAMES_URL.format(username=username)
    params = {
        "max": max_games,
        "opening": "true",
        "moves": "true",
        "pgnInJson": "false",
    }
    headers = {"Accept": "application/x-chess-pgn", "User-Agent": USER_AGENT}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params=params, headers=headers)
    except httpx.HTTPError as e:
        raise ScoutingError(f"Could not reach Lichess: {e}") from e
    if resp.status_code == 404:
        raise ScoutingError(f"No Lichess account found for '{username}'.")
    if resp.status_code == 429:
        raise ScoutingError("Lichess rate-limited this request -- wait a bit and try again.")
    resp.raise_for_status()
    text = resp.text.strip()
    if not text:
        return []
    # Multiple PGNs are separated by a blank line between games.
    games = [g.strip() for g in text.split("\n\n\n") if g.strip()]
    return games


def fetch_chesscom_pgns(username: str, max_games: int = 100, timeout: float = 30.0) -> List[str]:
    headers = {"User-Agent": USER_AGENT}
    archives_url = CHESSCOM_ARCHIVES_URL.format(username=username.lower())
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(archives_url, headers=headers)
            if resp.status_code == 404:
                raise ScoutingError(f"No chess.com account found for '{username}'.")
            resp.raise_for_status()
            archive_urls = resp.json().get("archives", [])
            archive_urls = list(reversed(archive_urls))  # most recent month first

            pgns: List[str] = []
            for archive_url in archive_urls:
                if len(pgns) >= max_games:
                    break
                r = client.get(archive_url, headers=headers)
                if r.status_code != 200:
                    continue
                for game in r.json().get("games", []):
                    pgn = game.get("pgn")
                    if pgn:
                        pgns.append(pgn)
                    if len(pgns) >= max_games:
                        break
    except httpx.HTTPError as e:
        raise ScoutingError(f"Could not reach chess.com: {e}") from e
    return pgns[:max_games]


@dataclass
class OpeningStat:
    eco: Optional[str]
    name: str
    games: int = 0
    wins: float = 0.0
    draws: float = 0.0
    losses: float = 0.0
    score: float = 0.0  # sum of subject's score (1/0.5/0) across these games

    def as_dict(self) -> dict:
        return {
            "eco": self.eco,
            "name": self.name,
            "games": self.games,
            "wins": self.wins,
            "draws": self.draws,
            "losses": self.losses,
            "score_rate": round(self.score / self.games, 3) if self.games else 0.0,
        }


def _subject_score(result: str, subject_is_white: bool) -> Optional[float]:
    if result == "1-0":
        return 1.0 if subject_is_white else 0.0
    if result == "0-1":
        return 0.0 if subject_is_white else 1.0
    if result == "1/2-1/2":
        return 0.5
    return None


def build_scouting_report(platform: str, username: str, max_games: int = 100) -> dict:
    platform = platform.lower()
    if platform == "lichess":
        pgns = fetch_lichess_pgns(username, max_games=max_games)
    elif platform in ("chesscom", "chess.com"):
        pgns = fetch_chesscom_pgns(username, max_games=max_games)
    else:
        raise ScoutingError(f"Unknown platform '{platform}' (use 'lichess' or 'chesscom').")

    if not pgns:
        raise ScoutingError(f"No public games found for '{username}' on {platform}.")

    book = get_book()
    as_white: Dict[str, OpeningStat] = {}
    as_black: Dict[str, OpeningStat] = {}
    analyzed = 0
    skipped = 0

    for pgn_text in pgns:
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        if game is None:
            skipped += 1
            continue
        headers = game.headers
        white_name = (headers.get("White") or "").lower()
        black_name = (headers.get("Black") or "").lower()
        uname = username.lower()
        if uname == white_name:
            subject_is_white = True
        elif uname == black_name:
            subject_is_white = False
        else:
            skipped += 1
            continue

        moves = list(game.mainline_moves())
        uci_moves = [m.uci() for m in moves]
        opening = book.classify(uci_moves)
        if opening:
            key = f"{opening['eco']}|{opening['name']}"
            name, eco = opening["name"], opening["eco"]
        else:
            key = "UNKNOWN"
            name, eco = "Unclassified opening", None

        score = _subject_score(headers.get("Result", "*"), subject_is_white)
        if score is None:
            skipped += 1
            continue

        bucket = as_white if subject_is_white else as_black
        stat = bucket.setdefault(key, OpeningStat(eco=eco, name=name))
        stat.games += 1
        stat.score += score
        if score == 1.0:
            stat.wins += 1
        elif score == 0.5:
            stat.draws += 1
        else:
            stat.losses += 1
        analyzed += 1

    def ranked(bucket: Dict[str, OpeningStat], min_games: int = 2) -> List[dict]:
        stats = [s.as_dict() for s in bucket.values() if s.games >= min_games]
        return sorted(stats, key=lambda s: s["score_rate"])

    def most_common(bucket: Dict[str, OpeningStat]) -> List[dict]:
        stats = [s.as_dict() for s in bucket.values()]
        return sorted(stats, key=lambda s: -s["games"])[:10]

    as_white_ranked = ranked(as_white)
    as_black_ranked = ranked(as_black)

    return {
        "platform": platform,
        "username": username,
        "games_fetched": len(pgns),
        "games_analyzed": analyzed,
        "games_skipped": skipped,
        "as_white": {
            "most_common": most_common(as_white),
            "weakest": as_white_ranked[:8],
        },
        "as_black": {
            "most_common": most_common(as_black),
            "weakest": as_black_ranked[:8],
        },
        "recommendations": {
            "when_they_have_white": as_white_ranked[:5],
            "when_they_have_black": as_black_ranked[:5],
        },
    }
