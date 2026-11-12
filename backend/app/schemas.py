from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

COLOR = "^(white|black)$"


class AnalyzeRequest(BaseModel):
    pgn: str = Field(min_length=1, max_length=200_000)
    depth: int = Field(default=14, ge=6, le=22)
    critical_depth: int = Field(default=18, ge=8, le=24)


class RepertoireCreate(BaseModel):
    color: str = Field(pattern=COLOR)
    name: str = Field(min_length=1, max_length=200)
    eco: Optional[str] = Field(default=None, max_length=5)
    moves_uci: List[str] = Field(min_length=1, max_length=120)
    source: str = Field(default="manual", max_length=30)
    note: Optional[str] = Field(default=None, max_length=2000)


class OpeningRef(BaseModel):
    eco: str = Field(max_length=5)
    name: str = Field(max_length=200)


class RepertoireBulkCreate(BaseModel):
    color: str = Field(pattern=COLOR)
    openings: List[OpeningRef] = Field(min_length=1, max_length=500)
    source: str = Field(default="manual", max_length=30)


class RepertoireImportPgn(BaseModel):
    color: str = Field(pattern=COLOR)
    pgn: str = Field(min_length=1, max_length=500_000)


class RepertoireUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=2000)


class RepertoireBulkDelete(BaseModel):
    ids: List[int] = Field(min_length=1, max_length=2000)


class AttemptRequest(BaseModel):
    line_id: int
    mode: str = Field(default="review", pattern="^(learn|review|drill)$")
    # Either report what happened and let the server grade it...
    mistakes: int = Field(default=0, ge=0, le=999)
    hints: int = Field(default=0, ge=0, le=999)
    # ...or (older clients) send an explicit Anki-style grade.
    result: Optional[str] = Field(default=None, pattern="^(again|hard|good|easy)$")
