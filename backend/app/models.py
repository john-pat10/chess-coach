from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class RepertoireLine(Base):
    """One full opening line the user wants to learn/drill."""

    __tablename__ = "repertoire_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    color: Mapped[str] = mapped_column(String(5))          # "white" or "black" -- the side the USER plays
    eco: Mapped[str | None] = mapped_column(String(5), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    moves_uci: Mapped[str] = mapped_column(Text)            # comma-separated uci moves, full line
    source: Mapped[str] = mapped_column(String(30), default="manual")  # manual | opponent_scout
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    review_state: Mapped["ReviewState"] = relationship(
        back_populates="line", uselist=False, cascade="all, delete-orphan"
    )

    def moves_list(self) -> list[str]:
        return [m for m in self.moves_uci.split(",") if m]


class ReviewState(Base):
    """Spaced-repetition (SM-2 style) scheduling state for one repertoire line."""

    __tablename__ = "review_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("repertoire_lines.id"))
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[float] = mapped_column(Float, default=0.0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    last_result: Mapped[str | None] = mapped_column(String(10), nullable=True)
    total_attempts: Mapped[int] = mapped_column(Integer, default=0)
    total_correct_first_try: Mapped[int] = mapped_column(Integer, default=0)

    line: Mapped["RepertoireLine"] = relationship(back_populates="review_state")
