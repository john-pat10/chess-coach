"""Repertoire management + a small SM-2 (SuperMemo-2) spaced-repetition
scheduler for drilling opening lines -- the same idea ChessRep/Anki use.
"""
from __future__ import annotations

import datetime as dt
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import RepertoireLine, ReviewState

# Maps a simple 4-button grade (like Anki) to the SM-2 "quality" scale (0-5).
GRADE_TO_QUALITY = {"again": 1, "hard": 3, "good": 4, "easy": 5}


def add_line(
    db: Session,
    color: str,
    name: str,
    moves_uci: List[str],
    eco: Optional[str] = None,
    source: str = "manual",
    note: Optional[str] = None,
) -> RepertoireLine:
    line = RepertoireLine(
        color=color,
        eco=eco,
        name=name,
        moves_uci=",".join(moves_uci),
        source=source,
        note=note,
    )
    db.add(line)
    db.flush()
    state = ReviewState(line_id=line.id, due_at=dt.datetime.utcnow())
    db.add(state)
    db.commit()
    db.refresh(line)
    return line


def list_lines(db: Session) -> List[RepertoireLine]:
    return list(db.scalars(select(RepertoireLine).order_by(RepertoireLine.created_at.desc())))


def delete_line(db: Session, line_id: int) -> bool:
    line = db.get(RepertoireLine, line_id)
    if line is None:
        return False
    db.delete(line)
    db.commit()
    return True


def get_due_line(db: Session) -> Optional[RepertoireLine]:
    now = dt.datetime.utcnow()
    stmt = (
        select(RepertoireLine)
        .join(ReviewState)
        .where(ReviewState.due_at <= now)
        .order_by(ReviewState.due_at.asc())
        .limit(1)
    )
    return db.scalars(stmt).first()


def upcoming_summary(db: Session) -> dict:
    now = dt.datetime.utcnow()
    lines = list_lines(db)
    due_now = sum(1 for l in lines if l.review_state and l.review_state.due_at <= now)
    return {"total_lines": len(lines), "due_now": due_now}


def _sm2_update(state: ReviewState, quality: int) -> None:
    """Classic SM-2: adjusts ease factor + interval from a 0-5 quality score."""
    if quality < 3:
        state.repetitions = 0
        state.interval_days = 1
    else:
        if state.repetitions == 0:
            state.interval_days = 1
        elif state.repetitions == 1:
            state.interval_days = 6
        else:
            state.interval_days = round(state.interval_days * state.ease_factor, 2)
        state.repetitions += 1

    new_ef = state.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    state.ease_factor = max(1.3, round(new_ef, 3))
    state.due_at = dt.datetime.utcnow() + dt.timedelta(days=state.interval_days)


def record_attempt(db: Session, line_id: int, result: str) -> Optional[ReviewState]:
    """result is one of 'again' | 'hard' | 'good' | 'easy' (Anki-style buttons)."""
    if result not in GRADE_TO_QUALITY:
        raise ValueError(f"Unknown result '{result}', expected one of {list(GRADE_TO_QUALITY)}")
    line = db.get(RepertoireLine, line_id)
    if line is None or line.review_state is None:
        return None
    state = line.review_state
    quality = GRADE_TO_QUALITY[result]
    state.total_attempts += 1
    if result in ("good", "easy") and state.repetitions == 0:
        state.total_correct_first_try += 1
    state.last_result = result
    _sm2_update(state, quality)
    db.commit()
    db.refresh(state)
    return state
