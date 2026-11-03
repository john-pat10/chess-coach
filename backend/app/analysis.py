"""Full-game analysis: per-move eval, classification, natural-language
commentary, and alternative lines at the critical moments -- the engine
room behind the "Game Review" feature.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import List, Optional

import chess
import chess.pgn

from .engine import Engine
from .eval_utils import MATE_SCORE_CP as MATE_SCORE_DECISIVE
from .eval_utils import accuracy_from_avg_win_loss, cp_to_win_percent, format_cp, score_to_cp
from .openings import get_book

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}

# Move classification thresholds, in win% lost by the move (see eval_utils
# for the win% formula). These mirror the rough bands lichess/chess.com use.
INACCURACY_WP_LOSS = 5.0
MISTAKE_WP_LOSS = 10.0
BLUNDER_WP_LOSS = 20.0
EXCELLENT_WP_LOSS = 2.0


def parse_pgn(pgn_text: str) -> chess.pgn.Game:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse this PGN -- check that it's a valid game.")
    return game


def _material_count(board: chess.Board, color: chess.Color) -> int:
    return sum(
        len(board.pieces(pt, color)) * val for pt, val in PIECE_VALUES.items()
    )


def _looks_like_sacrifice(board_before: chess.Board, move: chess.Move) -> bool:
    """Heuristic: did the mover just leave a piece where it can be won back
    for less than it's worth? Used only as one signal for 'Brilliant'.
    """
    mover = board_before.turn
    board_after = board_before.copy()
    board_after.push(move)
    moved_piece = board_after.piece_at(move.to_square)
    if moved_piece is None or moved_piece.piece_type == chess.PAWN:
        return False
    moved_value = PIECE_VALUES[moved_piece.piece_type]

    best_recapture_value = None
    for reply in board_after.legal_moves:
        if reply.to_square != move.to_square or not board_after.is_capture(reply):
            continue
        attacker = board_after.piece_at(reply.from_square)
        if attacker is None:
            continue
        cost = PIECE_VALUES[attacker.piece_type]
        if best_recapture_value is None or cost < best_recapture_value:
            best_recapture_value = cost
    if best_recapture_value is None:
        return False
    # A "sacrifice" if the piece can be taken by something worth less than it.
    return best_recapture_value < moved_value


def _pv_to_san(board: chess.Board, pv, max_moves: int = 6) -> str:
    b = board.copy()
    parts = []
    for i, move in enumerate(pv[:max_moves]):
        if move not in b.legal_moves:
            break
        prefix = f"{b.fullmove_number}." if b.turn == chess.WHITE else (
            f"{b.fullmove_number}..." if i == 0 else ""
        )
        san = b.san(move)
        parts.append(f"{prefix}{san}" if prefix else san)
        b.push(move)
    return " ".join(parts)


def classify_move(played_is_best: bool, wp_loss: float, in_book: bool, brilliant: bool) -> str:
    if in_book:
        return "Book"
    if played_is_best:
        return "Brilliant" if brilliant else "Best"
    if wp_loss < EXCELLENT_WP_LOSS:
        return "Excellent"
    if wp_loss < INACCURACY_WP_LOSS:
        return "Good"
    if wp_loss < MISTAKE_WP_LOSS:
        return "Inaccuracy"
    if wp_loss < BLUNDER_WP_LOSS:
        return "Mistake"
    return "Blunder"


def _commentary(
    san: str,
    classification: str,
    mover_name: str,
    best_san_before: Optional[str],
    eval_before_str: str,
    eval_after_str: str,
    punish_san: Optional[str],
) -> str:
    if classification == "Book":
        return f"{san} is a well-known book move."
    if classification == "Brilliant":
        return f"{san}!! is a brilliant move -- it looks risky but is objectively the strongest move here, keeping {mover_name} firmly ahead."
    if classification == "Best":
        return f"{san} is the engine's top choice in this position."
    if classification == "Excellent":
        extra = f" (best was {best_san_before})" if best_san_before and best_san_before != san else ""
        return f"{san} is an excellent move, nearly as strong as the top engine line{extra}."
    if classification == "Good":
        return f"{san} is a reasonable, solid move."
    if classification == "Inaccuracy":
        base = f"{san} is a slight inaccuracy."
        if best_san_before:
            base += f" {best_san_before} kept a firmer grip on the position."
        return base
    if classification == "Mistake":
        base = f"{san} is a mistake, giving {('White' if mover_name=='Black' else 'Black')} the upper hand."
        if punish_san:
            base += f" {punish_san} presses the advantage."
        if best_san_before:
            base += f" {best_san_before} was correct instead."
        return base
    # Blunder
    base = f"{san} is a blunder."
    if punish_san:
        base += f" After {punish_san}, the evaluation swings to {eval_after_str}."
    if best_san_before:
        base += f" {best_san_before} would have kept things under control ({eval_before_str})."
    return base


def analyze_game(
    pgn_text: str,
    depth: int = 14,
    critical_depth: int = 18,
    critical_multipv: int = 3,
    max_critical_lines: int = 12,
) -> dict:
    game = parse_pgn(pgn_text)
    headers = dict(game.headers)
    board = game.board()
    moves = list(game.mainline_moves())
    if not moves:
        raise ValueError("This game has no moves to analyze.")

    uci_moves = [m.uci() for m in moves]
    opening = get_book().classify(uci_moves)
    book_ply = opening["ply"] if opening else 0

    moves_data: List[dict] = []
    evals_white_cp: List[int] = [0]  # index 0 = starting position
    fens_before: List[str] = []

    with Engine() as eng:
        info0 = eng.analyse(board, depth=depth, multipv=1)
        evals_white_cp[0] = score_to_cp(info0[0]["score"], chess.WHITE)
        best_uci = info0[0]["pv"][0].uci() if info0[0].get("pv") else None
        best_san = board.san(info0[0]["pv"][0]) if info0[0].get("pv") else None

        for ply_idx, move in enumerate(moves):
            mover_color = board.turn
            mover_name = "White" if mover_color == chess.WHITE else "Black"
            san = board.san(move)
            fens_before.append(board.fen())

            played_is_best = move.uci() == best_uci
            in_book = (ply_idx + 1) <= book_ply
            brilliant = False
            if played_is_best and not in_book:
                brilliant = _looks_like_sacrifice(board, move)

            cp_before_white = evals_white_cp[-1]
            cp_before_mover = cp_before_white if mover_color == chess.WHITE else -cp_before_white
            wp_before = cp_to_win_percent(cp_before_mover)

            board.push(move)

            # A checkmated/stalemated position has no legal moves, so it
            # can't be handed to the engine -- score it directly instead.
            if board.is_checkmate():
                cp_after_white = MATE_SCORE_DECISIVE if mover_color == chess.WHITE else -MATE_SCORE_DECISIVE
                next_best_move = None
            elif board.is_game_over():
                cp_after_white = 0
                next_best_move = None
            else:
                info = eng.analyse(board, depth=depth, multipv=1)
                cp_after_white = score_to_cp(info[0]["score"], chess.WHITE)
                next_best_move = info[0]["pv"][0] if info[0].get("pv") else None

            evals_white_cp.append(cp_after_white)
            punish_san = None
            if next_best_move is not None and next_best_move in board.legal_moves:
                punish_san = board.san(next_best_move)
            next_best_uci = next_best_move.uci() if next_best_move else None

            cp_after_mover = cp_after_white if mover_color == chess.WHITE else -cp_after_white
            wp_after = cp_to_win_percent(cp_after_mover)
            wp_loss = max(0.0, wp_before - wp_after)

            classification = classify_move(played_is_best, wp_loss, in_book, brilliant)

            eval_before_str = format_cp(cp_before_white)
            eval_after_str = format_cp(cp_after_white)
            best_san_before = best_san if (best_san and best_san != san) else None

            comment = _commentary(
                san, classification, mover_name, best_san_before,
                eval_before_str, eval_after_str, punish_san,
            )

            moves_data.append({
                "ply": ply_idx + 1,
                "move_number": (ply_idx // 2) + 1,
                "color": mover_name,
                "san": san,
                "uci": move.uci(),
                "classification": classification,
                "eval_before_cp": cp_before_white,
                "eval_after_cp": cp_after_white,
                "eval_after_str": eval_after_str,
                "win_percent_loss": round(wp_loss, 1),
                "best_move_san": best_san_before,
                "comment": comment,
                "fen_after": board.fen(),
            })

            best_uci = next_best_uci
            best_san = punish_san

        # Second pass: pull alternative lines (multipv) for the worst moments.
        critical_indices = sorted(
            range(len(moves_data)),
            key=lambda i: -moves_data[i]["win_percent_loss"],
        )
        critical_indices = [
            i for i in critical_indices
            if moves_data[i]["classification"] in ("Mistake", "Blunder")
        ][:max_critical_lines]

        for i in sorted(critical_indices):
            fen = fens_before[i]
            b = chess.Board(fen)
            infos = eng.analyse(b, depth=critical_depth, multipv=critical_multipv)
            lines = []
            for pv_info in infos:
                pv = pv_info.get("pv") or []
                if not pv:
                    continue
                cp = score_to_cp(pv_info["score"], chess.WHITE)
                lines.append({
                    "eval_str": format_cp(cp),
                    "eval_cp": cp,
                    "line_san": _pv_to_san(b, pv),
                })
            moves_data[i]["alternative_lines"] = lines

    # Per-side summary stats.
    summary = {}
    for color_name in ("White", "Black"):
        side_moves = [m for m in moves_data if m["color"] == color_name and m["classification"] != "Book"]
        counts = {}
        for m in moves_data:
            if m["color"] != color_name:
                continue
            counts[m["classification"]] = counts.get(m["classification"], 0) + 1
        avg_loss = (
            sum(m["win_percent_loss"] for m in side_moves) / len(side_moves)
            if side_moves else 0.0
        )
        summary[color_name] = {
            "accuracy": round(accuracy_from_avg_win_loss(avg_loss), 1),
            "counts": counts,
            "blunders": counts.get("Blunder", 0),
            "mistakes": counts.get("Mistake", 0),
            "inaccuracies": counts.get("Inaccuracy", 0),
        }

    return {
        "headers": headers,
        "opening": opening,
        "moves": moves_data,
        "eval_graph_white_cp": evals_white_cp,
        "summary": summary,
    }
