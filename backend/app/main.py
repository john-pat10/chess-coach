from __future__ import annotations

import datetime as dt
from typing import List, Optional

import chess
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import trainer
from .analysis import analyze_game
from .db import get_db, init_db
from .openings import get_book
from .opponent import ScoutingError, build_scouting_report
from .schemas import AnalyzeRequest, AttemptRequest, RepertoireCreate

app = FastAPI(title="Chess Coach", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()
    get_book()  # warm the opening tree once at boot instead of on first request


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- Game review

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    try:
        return analyze_game(req.pgn, depth=req.depth, critical_depth=req.critical_depth)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------- Opponent scout

@app.get("/api/opponent/{platform}/{username}")
def opponent_report(platform: str, username: str, max_games: int = Query(default=100, ge=5, le=500)):
    try:
        return build_scouting_report(platform, username, max_games=max_games)
    except ScoutingError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------- Openings browsing

def _uci_moves_to_line(uci_moves: List[str]) -> List[dict]:
    board = chess.Board()
    out = []
    for uci in uci_moves:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            break
        san = board.san(move)
        out.append({
            "uci": uci,
            "from": uci[:2],
            "to": uci[2:4],
            "promotion": uci[4:] if len(uci) > 4 else None,
            "san": san,
            "fen_after": None,  # filled below
        })
        board.push(move)
        out[-1]["fen_after"] = board.fen()
    return out


@app.get("/api/openings/tree")
def openings_tree(moves: str = Query(default="")):
    """moves = comma-separated uci moves defining where in the tree to look."""
    uci_moves = [m for m in moves.split(",") if m]
    book = get_book()
    node = book.node_at(uci_moves) if uci_moves else book.root
    if node is None:
        raise HTTPException(status_code=404, detail="No opening line matches those moves.")
    return node.to_dict()


@app.get("/api/openings/search")
def openings_search(q: str = Query(min_length=2), limit: int = Query(default=60, ge=1, le=300)):
    return get_book().search(q, limit=limit)


@app.get("/api/openings/line")
def openings_line(eco: str, name: str):
    moves = get_book().moves_for(eco, name)
    if moves is None:
        raise HTTPException(status_code=404, detail="Unknown opening.")
    return {"eco": eco, "name": name, "moves": _uci_moves_to_line(moves)}


# ---------------------------------------------------------------- Repertoire + trainer

def _line_to_dict(line) -> dict:
    state = line.review_state
    return {
        "id": line.id,
        "color": line.color,
        "eco": line.eco,
        "name": line.name,
        "source": line.source,
        "note": line.note,
        "moves": _uci_moves_to_line(line.moves_list()),
        "review": None if state is None else {
            "due_at": state.due_at.isoformat(),
            "interval_days": state.interval_days,
            "ease_factor": state.ease_factor,
            "repetitions": state.repetitions,
            "last_result": state.last_result,
            "total_attempts": state.total_attempts,
            "total_correct_first_try": state.total_correct_first_try,
            "is_due": state.due_at <= dt.datetime.utcnow(),
        },
    }


@app.get("/api/repertoire")
def list_repertoire(db: Session = Depends(get_db)):
    return [_line_to_dict(l) for l in trainer.list_lines(db)]


@app.post("/api/repertoire")
def create_repertoire_line(body: RepertoireCreate, db: Session = Depends(get_db)):
    line = trainer.add_line(
        db, color=body.color, name=body.name, moves_uci=body.moves_uci,
        eco=body.eco, source=body.source, note=body.note,
    )
    return _line_to_dict(line)


@app.delete("/api/repertoire/{line_id}")
def delete_repertoire_line(line_id: int, db: Session = Depends(get_db)):
    ok = trainer.delete_line(db, line_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Line not found.")
    return {"deleted": True}


@app.get("/api/trainer/summary")
def trainer_summary(db: Session = Depends(get_db)):
    return trainer.upcoming_summary(db)


@app.get("/api/trainer/next")
def trainer_next(db: Session = Depends(get_db)):
    line = trainer.get_due_line(db)
    if line is None:
        return None
    return _line_to_dict(line)


@app.post("/api/trainer/attempt")
def trainer_attempt(body: AttemptRequest, db: Session = Depends(get_db)):
    state = trainer.record_attempt(db, body.line_id, body.result)
    if state is None:
        raise HTTPException(status_code=404, detail="Line not found.")
    return {
        "due_at": state.due_at.isoformat(),
        "interval_days": state.interval_days,
        "ease_factor": state.ease_factor,
        "repetitions": state.repetitions,
    }
