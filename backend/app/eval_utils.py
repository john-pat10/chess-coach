"""Score conversion helpers shared by the analysis engine.

The win% formula and accuracy formula below are the same ones the lichess
client uses (both are public / documented in lila's open-source code), so
"accuracy" numbers here should feel familiar if you've used lichess's
analysis board before.
"""
from __future__ import annotations

import math
from typing import Optional

import chess
import chess.engine

MATE_SCORE_CP = 10000  # cp value assigned to a mate-in-N, decayed by N


def score_to_cp(score: chess.engine.PovScore, pov: chess.Color) -> int:
    """Convert a PovScore to centipawns from the given color's perspective."""
    relative = score.pov(pov)
    if relative.is_mate():
        mate_in = relative.mate()
        assert mate_in is not None
        # Closer mates are "more winning" -- decay the score with distance.
        sign = 1 if mate_in > 0 else -1
        return sign * (MATE_SCORE_CP - abs(mate_in) * 10)
    cp = relative.score()
    return cp if cp is not None else 0


def cp_to_win_percent(cp: int) -> float:
    """Centipawns (from one side's POV) -> that side's win probability, 0-100."""
    cp = max(-1000, min(1000, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def accuracy_from_avg_win_loss(avg_win_percent_loss: float) -> float:
    """Lichess's per-game accuracy % from the average win% lost per move."""
    val = 103.1668 * math.exp(-0.04354 * avg_win_percent_loss) - 3.1669
    return max(0.0, min(100.0, val))


def format_cp(cp: int) -> str:
    """Human-readable eval string, e.g. '+1.4' or '-0.3' or '#3'."""
    if abs(cp) >= MATE_SCORE_CP - 200:
        moves_to_mate = max(1, round((MATE_SCORE_CP - abs(cp)) / 10))
        sign = "" if cp > 0 else "-"
        return f"{sign}#{moves_to_mate}"
    return f"{cp / 100:+.2f}"
