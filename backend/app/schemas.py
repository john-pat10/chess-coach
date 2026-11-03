from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    pgn: str
    depth: int = Field(default=14, ge=6, le=22)
    critical_depth: int = Field(default=18, ge=8, le=24)


class RepertoireCreate(BaseModel):
    color: str = Field(pattern="^(white|black)$")
    name: str
    eco: Optional[str] = None
    moves_uci: List[str]
    source: str = "manual"
    note: Optional[str] = None


class AttemptRequest(BaseModel):
    line_id: int
    result: str = Field(pattern="^(again|hard|good|easy)$")
