"""Repertoire management and the openings trainer's scheduling.

A line moves through three stages:

  new      -- just added; you haven't been shown it yet        (Learn mode)
  learned  -- in the spaced-repetition cycle (SM-2, like Anki) (Review mode)
  mastered -- learned, with a review interval of 3+ weeks

Grading is automatic: the client reports how many wrong moves and hints a
drill took, and that decides how soon the line comes back.
"""
from __future__ import annotations

import datetime as dt
import io
import random
from typing import Dict, Iterable, List, Optional, Tuple

import chess
import chess.pgn
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import utcnow
from .models import RepertoireLine, ReviewLog, ReviewState
from .openings import get_book

# Maps an Anki-style grade to the SM-2 "quality" scale (0-5).
GRADE_TO_QUALITY = {"again": 1, "hard": 3, "good": 4, "easy": 5}
MODES = ("learn", "review", "drill")

MAX_LINE_PLIES = 120
MASTERED_INTERVAL_DAYS = 21
RELEARN_DELAY = dt.timedelta(minutes=10)
MAX_PGN_LINES = 300


# ------------------------------------------------------------------ validation

def validate_line(color: str, moves_uci: Iterable[str]) -> List[str]:
    """Check a line is legal chess from the starting position and worth
    drilling for this colour. Returns the cleaned move list or raises ValueError."""
    if color not in ("white", "black"):
        raise ValueError("Color must be 'white' or 'black'.")
    moves = [m.strip().lower() for m in moves_uci if m and m.strip()]
    if not moves:
        raise ValueError("A line needs at least one move.")
    if len(moves) > MAX_LINE_PLIES:
        raise ValueError(f"Lines are limited to {MAX_LINE_PLIES} half-moves.")
    board = chess.Board()
    for i, uci in enumerate(moves):
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            raise ValueError(f"Move {i + 1} ('{uci}') is not a valid move.") from None
        if move not in board.legal_moves:
            raise ValueError(f"Move {i + 1} ('{uci}') is not legal in that position.")
        board.push(move)
    if color == "black" and len(moves) < 2:
        raise ValueError("A line for Black needs at least one reply by Black.")
    return moves


# ------------------------------------------------------------------ repertoire

def find_line(db: Session, color: str, moves: List[str]) -> Optional[RepertoireLine]:
    stmt = select(RepertoireLine).where(
        RepertoireLine.color == color, RepertoireLine.moves_uci == ",".join(moves)
    )
    return db.scalars(stmt).first()


def add_line(
    db: Session,
    color: str,
    name: str,
    moves_uci: List[str],
    eco: Optional[str] = None,
    source: str = "manual",
    note: Optional[str] = None,
    commit: bool = True,
) -> Tuple[RepertoireLine, bool]:
    """Add a line, or return the existing one if you already have these exact
    moves for this colour. Returns (line, created)."""
    moves = validate_line(color, moves_uci)
    existing = find_line(db, color, moves)
    if existing is not None:
        return existing, False
    line = RepertoireLine(
        color=color, eco=eco, name=name.strip() or "Custom line",
        moves_uci=",".join(moves), source=source, note=note,
    )
    db.add(line)
    db.flush()
    db.add(ReviewState(line_id=line.id, due_at=utcnow()))
    if commit:
        db.commit()
        db.refresh(line)
    else:
        db.flush()
    return line, True


def add_openings(db: Session, color: str, openings: Iterable[Tuple[str, str]], source: str = "manual") -> dict:
    """Add many named book openings in one transaction."""
    book = get_book()
    added = skipped = 0
    errors: List[str] = []
    for eco, name in openings:
        moves = book.moves_for(eco, name)
        if moves is None:
            errors.append(f"Unknown opening: {eco} {name}")
            continue
        try:
            _, created = add_line(db, color, name, moves, eco=eco, source=source, commit=False)
        except ValueError as e:
            errors.append(f"{name}: {e}")
            continue
        added += created
        skipped += not created
    db.commit()
    return {"added": added, "skipped": skipped, "errors": errors}


def lines_from_pgn(pgn_text: str, color: str) -> Tuple[List[dict], List[str]]:
    """Turn a PGN (any number of games, with variations) into drillable lines:
    one per path from the start position to the end of each variation."""
    book = get_book()
    out: List[dict] = []
    warnings: List[str] = []
    stream = io.StringIO(pgn_text)
    game_no = 0
    while len(out) < MAX_PGN_LINES:
        game = chess.pgn.read_game(stream)
        if game is None:
            break
        game_no += 1
        if game.errors:
            warnings.append(f"Game {game_no}: some moves could not be read and were skipped.")
        if game.headers.get("FEN") and game.board().fen() != chess.STARTING_FEN:
            warnings.append(f"Game {game_no}: skipped, it does not start from the normal starting position.")
            continue
        title = next(
            (game.headers[k] for k in ("Opening", "ChapterName", "Event")
             if game.headers.get(k, "?") not in ("?", "")),
            None,
        )
        # Walk every variation down to its last move.
        stack = [(game, [])]
        while stack and len(out) < MAX_PGN_LINES:
            node, moves = stack.pop()
            if not node.variations:
                if moves:
                    out.append({"moves": moves[:MAX_LINE_PLIES], "title": title})
                continue
            for child in reversed(node.variations):
                stack.append((child, moves + [child.move.uci()]))
    if game_no == 0:
        raise ValueError("Could not find a game in that PGN.")

    lines: List[dict] = []
    for item in out:
        moves = item["moves"]
        # End on your own move: a trailing opponent move gives you nothing to answer.
        user_moves_last = (len(moves) % 2 == 1) == (color == "white")
        if not user_moves_last:
            moves = moves[:-1]
        if not moves:
            continue
        opening = book.classify(moves)
        lines.append({
            "moves": moves,
            "eco": opening["eco"] if opening else None,
            "name": (opening["name"] if opening else None) or item["title"] or "Custom line",
        })
    if len(out) >= MAX_PGN_LINES:
        warnings.append(f"Only the first {MAX_PGN_LINES} lines were imported.")
    return lines, warnings


def import_pgn(db: Session, color: str, pgn_text: str) -> dict:
    lines, warnings = lines_from_pgn(pgn_text, color)
    added = skipped = 0
    for item in lines:
        try:
            _, created = add_line(db, color, item["name"], item["moves"], eco=item["eco"], source="pgn", commit=False)
        except ValueError as e:
            warnings.append(str(e))
            continue
        added += created
        skipped += not created
    db.commit()
    return {"added": added, "skipped": skipped, "errors": warnings}


def list_lines(db: Session, color: Optional[str] = None) -> List[RepertoireLine]:
    stmt = select(RepertoireLine).order_by(RepertoireLine.name, RepertoireLine.moves_uci)
    if color:
        stmt = stmt.where(RepertoireLine.color == color)
    return list(db.scalars(stmt))


def update_line(db: Session, line_id: int, name: Optional[str] = None, note: Optional[str] = None) -> Optional[RepertoireLine]:
    line = db.get(RepertoireLine, line_id)
    if line is None:
        return None
    if name is not None:
        line.name = name.strip() or line.name
    if note is not None:
        line.note = note.strip() or None
    db.commit()
    db.refresh(line)
    return line


def delete_line(db: Session, line_id: int) -> bool:
    return delete_lines(db, [line_id]) == 1


def delete_lines(db: Session, ids: Iterable[int]) -> int:
    deleted = 0
    for line_id in set(ids):
        line = db.get(RepertoireLine, line_id)
        if line is not None:
            db.delete(line)
            deleted += 1
    db.commit()
    return deleted


# ------------------------------------------------------------------ scheduling

def stage_of(state: Optional[ReviewState], now: Optional[dt.datetime] = None) -> str:
    """new | due | learning | mastered"""
    now = now or utcnow()
    if state is None or not state.learned:
        return "new"
    if state.due_at <= now:
        return "due"
    return "mastered" if state.interval_days >= MASTERED_INTERVAL_DAYS else "learning"


def queue(db: Session, mode: str, color: Optional[str] = None, limit: int = 20) -> List[RepertoireLine]:
    """Lines for one training session.

      learn  -- lines you haven't been shown yet
      review -- learned lines that are due, most overdue first
      drill  -- a random mix of everything you've learned (doesn't affect the schedule)
    """
    if mode not in MODES:
        raise ValueError(f"Unknown mode '{mode}', expected one of {list(MODES)}")
    now = utcnow()
    lines = [l for l in list_lines(db, color) if l.review_state is not None]
    if mode == "learn":
        picked = [l for l in lines if not l.review_state.learned]
        picked.sort(key=lambda l: (l.created_at, l.id))
    elif mode == "review":
        picked = [l for l in lines if l.review_state.learned and l.review_state.due_at <= now]
        picked.sort(key=lambda l: l.review_state.due_at)
    else:
        picked = [l for l in lines if l.review_state.learned]
        random.shuffle(picked)
        return picked[:limit]
    picked = picked[:limit]
    # Put lines that share opening moves next to each other, so the trainer
    # can skip straight to where each one branches off.
    picked.sort(key=lambda l: l.moves_uci)
    return picked


def get_due_line(db: Session) -> Optional[RepertoireLine]:
    """The single most overdue line (new lines count as due)."""
    now = utcnow()
    stmt = (
        select(RepertoireLine).join(ReviewState)
        .where(ReviewState.due_at <= now)
        .order_by(ReviewState.due_at.asc()).limit(1)
    )
    return db.scalars(stmt).first()


def grade_for(mistakes: int, hints: int) -> str:
    slips = mistakes + hints
    if slips == 0:
        return "good"
    return "hard" if slips == 1 else "again"


def _sm2_update(state: ReviewState, quality: int, now: dt.datetime) -> None:
    """Classic SM-2: adjusts ease factor + interval from a 0-5 quality score."""
    if quality < 3:
        state.repetitions = 0
        state.interval_days = 0
        state.due_at = now + RELEARN_DELAY      # failed: see it again in this sitting
    else:
        if state.repetitions == 0:
            state.interval_days = 1
        elif state.repetitions == 1:
            state.interval_days = 6
        else:
            state.interval_days = round(max(1.0, state.interval_days) * state.ease_factor, 2)
        if quality == 3:                         # shaky: grow the gap more slowly
            state.interval_days = max(1.0, round(state.interval_days * 0.6, 2))
        state.repetitions += 1
        state.due_at = now + dt.timedelta(days=state.interval_days)

    new_ef = state.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    state.ease_factor = max(1.3, round(new_ef, 3))


def record_attempt(
    db: Session,
    line_id: int,
    result: Optional[str] = None,
    mode: str = "review",
    mistakes: int = 0,
    hints: int = 0,
) -> Optional[ReviewState]:
    """Record one finished drill of a line and reschedule it.

    Pass `mistakes`/`hints` to have it graded automatically, or an explicit
    `result` ('again' | 'hard' | 'good' | 'easy'). Drill mode is logged but
    never changes the schedule.
    """
    if mode not in MODES:
        raise ValueError(f"Unknown mode '{mode}', expected one of {list(MODES)}")
    if result is None:
        result = grade_for(mistakes, hints)
    if result not in GRADE_TO_QUALITY:
        raise ValueError(f"Unknown result '{result}', expected one of {list(GRADE_TO_QUALITY)}")
    line = db.get(RepertoireLine, line_id)
    if line is None or line.review_state is None:
        return None
    state = line.review_state
    now = utcnow()

    db.add(ReviewLog(line_id=line.id, at=now, mode=mode, result=result, mistakes=mistakes, hints=hints))
    state.total_attempts += 1
    if result in ("good", "easy"):
        state.total_correct_first_try += 1
    state.last_result = result

    if mode == "learn" and not state.learned:
        # First pass through a new line: it enters the cycle and comes back tomorrow.
        state.learned = True
        state.repetitions = 1
        state.interval_days = 1
        state.due_at = now + dt.timedelta(days=1)
    elif mode != "drill":
        if state.learned and result == "again":
            state.lapses += 1
        state.learned = True
        _sm2_update(state, GRADE_TO_QUALITY[result], now)

    db.commit()
    db.refresh(state)
    return state


# ------------------------------------------------------------------ stats

def _local_date(utc_naive: dt.datetime) -> dt.date:
    return utc_naive.replace(tzinfo=dt.timezone.utc).astimezone().date()


def stats(db: Session) -> dict:
    now = utcnow()
    today = _local_date(now)
    lines = list_lines(db)

    def bucket() -> dict:
        return {"total": 0, "new": 0, "due": 0, "learning": 0, "mastered": 0}

    totals = bucket()
    by_color = {"white": bucket(), "black": bucket()}
    forecast = [0] * 7     # learned lines coming due: today (incl. overdue), tomorrow, ...
    for line in lines:
        stage = stage_of(line.review_state, now)
        for b in (totals, by_color.get(line.color, bucket())):
            b["total"] += 1
            b[stage] += 1
        state = line.review_state
        if state is not None and state.learned:
            days_ahead = max(0, (_local_date(state.due_at) - today).days)
            if days_ahead < 7:
                forecast[days_ahead] += 1

    logs = list(db.scalars(select(ReviewLog).where(ReviewLog.at >= now - dt.timedelta(days=400))))
    days_practiced = {_local_date(l.at) for l in logs}
    streak = 0
    day = today if today in days_practiced else today - dt.timedelta(days=1)
    while day in days_practiced:
        streak += 1
        day -= dt.timedelta(days=1)

    week_ago = today - dt.timedelta(days=6)
    recent = [l for l in logs if _local_date(l.at) >= week_ago and l.mode != "learn"]
    clean = sum(1 for l in recent if l.result in ("good", "easy"))
    activity = []
    for i in range(6, -1, -1):
        d = today - dt.timedelta(days=i)
        activity.append({"date": d.isoformat(), "count": sum(1 for l in logs if _local_date(l.at) == d)})

    return {
        **{f"{k}_lines" if k == "total" else k: v for k, v in totals.items()},
        "due_now": totals["due"],                       # kept for older clients
        "by_color": by_color,
        "day_streak": streak,
        "practiced_today": today in days_practiced,
        "reviews_today": sum(1 for l in logs if _local_date(l.at) == today),
        "accuracy_7d": round(100 * clean / len(recent)) if recent else None,
        "forecast": forecast,
        "activity": activity,
    }


def upcoming_summary(db: Session) -> dict:
    s = stats(db)
    return {"total_lines": s["total_lines"], "due_now": s["due_now"] + s["new"]}


# ------------------------------------------------------------------ coverage

def coverage(db: Session, color: str, max_gaps: int = 40) -> dict:
    """Find holes in a repertoire: positions your lines pass through where the
    opponent has a known book reply that none of your lines answers.

    Each reply is weighted by how many named openings follow it, so a gap
    against the Sicilian counts for far more than one against an oddity.
    """
    book = get_book()
    lines = [l.moves_list() for l in list_lines(db, color)]
    user_starts = 0 if color == "white" else 1
    prefixes = {tuple(m[:i]) for m in lines for i in range(len(m) + 1)}

    # Positions (as move prefixes) where the opponent is to move and your
    # repertoire has an answer to at least one of their replies.
    opponent_turns = {
        tuple(m[:i]) for m in lines for i in range(len(m))
        if i % 2 != user_starts and i + 1 < len(m)
    }

    covered_weight = 0
    gaps: List[dict] = []
    for prefix in opponent_turns:
        node = book.node_at(list(prefix))
        if node is None:
            continue
        for reply_uci, child in node.children.items():
            weight = child.size()
            if prefix + (reply_uci,) in prefixes:
                covered_weight += weight
                continue
            board = chess.Board()
            sans: List[str] = []
            for uci in prefix:
                move = chess.Move.from_uci(uci)
                sans.append(board.san(move))
                board.push(move)
            fen_before = board.fen()
            named = child.first_named()
            # Suggest the main named line that goes at least one move further,
            # so it actually gives you a reply to learn.
            answer = child.first_named(min_depth=1)
            suggestion = None
            if answer is not None:
                moves = book.moves_for(answer.eco, answer.name)
                if moves and list(moves[: len(prefix) + 1]) == list(prefix) + [reply_uci]:
                    suggestion = {"eco": answer.eco, "name": answer.name}
            gaps.append({
                "moves": list(prefix),
                "moves_san": sans,
                "reply": reply_uci,
                "reply_san": child.san,
                "fen": fen_before,
                "leads_to": named.name if named else None,
                "eco": named.eco if named else None,
                "weight": weight,
                "suggestion": suggestion,
            })

    gap_weight = sum(g["weight"] for g in gaps)
    total = covered_weight + gap_weight
    gaps.sort(key=lambda g: (-g["weight"], len(g["moves"])))
    return {
        "color": color,
        "lines": len(lines),
        "score": round(100 * covered_weight / total) if total else None,
        "gap_count": len(gaps),
        "gaps": gaps[:max_gaps],
    }
