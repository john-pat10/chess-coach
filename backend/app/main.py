from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import chess
import chess.engine
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import trainer
from .analysis import analyze_game
from .db import DB_PATH, get_db, init_db, utcnow
from .engine import stockfish_status
from .openings import get_book
from .opponent import ScoutingError, build_scouting_report
from .schemas import (
    AnalyzeRequest,
    AttemptRequest,
    RepertoireBulkCreate,
    RepertoireBulkDelete,
    RepertoireCreate,
    RepertoireImportPgn,
    RepertoireUpdate,
)

log = logging.getLogger("chess_coach")
VERSION = "0.2.0"

# The built frontend (`npm run build`). When it exists the backend serves the
# whole app from one address, so nobody needs to run a second dev server.
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    get_book()  # warm the opening tree once at boot instead of on first request
    yield


app = FastAPI(title="Chess Coach", version=VERSION, lifespan=lifespan)

# Only needed when the frontend runs on a different port without the Vite
# proxy; any localhost port is allowed since this is a local, single-user app.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    """Anything we didn't anticipate still comes back as readable JSON."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Something went wrong on the server ({type(exc).__name__}). Check the backend window for details."},
    )


@app.get("/api/health")
def health():
    book = get_book()
    return {
        "status": "ok",
        "version": VERSION,
        "stockfish": stockfish_status(),
        "openings": len(book._all_named),
        "database": str(DB_PATH),
    }


# ---------------------------------------------------------------- Game review

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    try:
        return analyze_game(req.pgn, depth=req.depth, critical_depth=req.critical_depth)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:            # Stockfish missing or unusable
        raise HTTPException(status_code=503, detail=str(e))
    except chess.engine.EngineError as e:
        raise HTTPException(status_code=503, detail=f"Stockfish stopped unexpectedly ({e}). Try again, or lower the depth.")


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
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            break
        if move not in board.legal_moves:
            break
        san = board.san(move)
        board.push(move)
        out.append({
            "uci": uci,
            "from": uci[:2],
            "to": uci[2:4],
            "promotion": uci[4:] if len(uci) > 4 else None,
            "san": san,
            "fen_after": board.fen(),
        })
    return out


def _parse_moves(moves: str) -> List[str]:
    return [m for m in moves.split(",") if m]


@app.get("/api/openings/tree")
def openings_tree(moves: str = Query(default="", max_length=1000)):
    """moves = comma-separated uci moves defining where in the tree to look.
    Positions outside the book come back with no children instead of an error."""
    uci_moves = _parse_moves(moves)
    book = get_book()
    node = book.node_at(uci_moves) if uci_moves else book.root
    opening = book.classify(uci_moves)
    if node is None:
        return {"move": None, "san": None, "eco": None, "name": None, "children": [], "in_book": False, "opening": opening}
    return {**node.to_dict(), "in_book": True, "opening": opening}


@app.get("/api/openings/search")
def openings_search(q: str = Query(min_length=2, max_length=100), limit: int = Query(default=60, ge=1, le=300)):
    return get_book().search(q, limit=limit)


@app.get("/api/openings/line")
def openings_line(eco: str, name: str):
    moves = get_book().moves_for(eco, name)
    if moves is None:
        raise HTTPException(status_code=404, detail="Unknown opening.")
    return {"eco": eco, "name": name, "moves": _uci_moves_to_line(moves)}


# ---------------------------------------------------------------- Repertoire

def _line_to_dict(line) -> dict:
    state = line.review_state
    now = utcnow()
    return {
        "id": line.id,
        "color": line.color,
        "eco": line.eco,
        "name": line.name,
        "source": line.source,
        "note": line.note,
        "moves": _uci_moves_to_line(line.moves_list()),
        "stage": trainer.stage_of(state, now),      # new | due | learning | mastered
        "review": None if state is None else {
            "due_at": state.due_at.isoformat() + "Z",
            "interval_days": state.interval_days,
            "ease_factor": state.ease_factor,
            "repetitions": state.repetitions,
            "last_result": state.last_result,
            "total_attempts": state.total_attempts,
            "total_correct_first_try": state.total_correct_first_try,
            "learned": bool(state.learned),
            "lapses": state.lapses,
            "is_due": state.due_at <= now,
        },
    }


@app.get("/api/repertoire")
def list_repertoire(color: Optional[str] = Query(default=None, pattern="^(white|black)$"), db: Session = Depends(get_db)):
    return [_line_to_dict(l) for l in trainer.list_lines(db, color)]


@app.post("/api/repertoire")
def create_repertoire_line(body: RepertoireCreate, db: Session = Depends(get_db)):
    try:
        line, created = trainer.add_line(
            db, color=body.color, name=body.name, moves_uci=body.moves_uci,
            eco=body.eco, source=body.source, note=body.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {**_line_to_dict(line), "created": created}


@app.post("/api/repertoire/bulk")
def create_repertoire_lines(body: RepertoireBulkCreate, db: Session = Depends(get_db)):
    """Add many named openings at once (e.g. every Sicilian Dragon line)."""
    return trainer.add_openings(db, body.color, [(o.eco, o.name) for o in body.openings], source=body.source)


@app.post("/api/repertoire/import-pgn")
def import_repertoire_pgn(body: RepertoireImportPgn, db: Session = Depends(get_db)):
    """Import a PGN study: every variation becomes its own drillable line."""
    try:
        return trainer.import_pgn(db, body.color, body.pgn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/repertoire/delete")
def delete_repertoire_lines(body: RepertoireBulkDelete, db: Session = Depends(get_db)):
    return {"deleted": trainer.delete_lines(db, body.ids)}


@app.get("/api/repertoire/coverage")
def repertoire_coverage(color: str = Query(pattern="^(white|black)$"), db: Session = Depends(get_db)):
    return trainer.coverage(db, color)


@app.patch("/api/repertoire/{line_id}")
def update_repertoire_line(line_id: int, body: RepertoireUpdate, db: Session = Depends(get_db)):
    line = trainer.update_line(db, line_id, name=body.name, note=body.note)
    if line is None:
        raise HTTPException(status_code=404, detail="Line not found.")
    return _line_to_dict(line)


@app.delete("/api/repertoire/{line_id}")
def delete_repertoire_line(line_id: int, db: Session = Depends(get_db)):
    if not trainer.delete_line(db, line_id):
        raise HTTPException(status_code=404, detail="Line not found.")
    return {"deleted": True}


# ---------------------------------------------------------------- Trainer

@app.get("/api/trainer/stats")
def trainer_stats(db: Session = Depends(get_db)):
    return trainer.stats(db)


@app.get("/api/trainer/summary")
def trainer_summary(db: Session = Depends(get_db)):
    return trainer.upcoming_summary(db)


@app.get("/api/trainer/queue")
def trainer_queue(
    mode: str = Query(default="review", pattern="^(learn|review|drill)$"),
    color: Optional[str] = Query(default=None, pattern="^(white|black)$"),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return [_line_to_dict(l) for l in trainer.queue(db, mode, color=color, limit=limit)]


@app.get("/api/trainer/next")
def trainer_next(db: Session = Depends(get_db)):
    line = trainer.get_due_line(db)
    return None if line is None else _line_to_dict(line)


@app.post("/api/trainer/attempt")
def trainer_attempt(body: AttemptRequest, db: Session = Depends(get_db)):
    state = trainer.record_attempt(
        db, body.line_id, result=body.result, mode=body.mode, mistakes=body.mistakes, hints=body.hints,
    )
    if state is None:
        raise HTTPException(status_code=404, detail="Line not found.")
    return {
        "result": state.last_result,
        "due_at": state.due_at.isoformat() + "Z",
        "interval_days": state.interval_days,
        "ease_factor": state.ease_factor,
        "repetitions": state.repetitions,
        "stage": trainer.stage_of(state),
    }


# ---------------------------------------------------------------- Frontend

@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def unknown_api_route(rest: str):
    raise HTTPException(status_code=404, detail=f"No such API endpoint: /api/{rest}")


if (FRONTEND_DIST / "index.html").is_file():
    if (FRONTEND_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        """Serve the built single-page app; unknown paths fall back to index.html
        so links like /trainer work when opened directly."""
        target = (FRONTEND_DIST / path).resolve()
        if path and target.is_file() and FRONTEND_DIST.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def no_frontend():
        return {
            "message": "The Chess Coach API is running, but the web app has not been built yet.",
            "fix": "Run `python run.py` from the project folder (it builds the app), "
                   "or `python run.py --dev` and open http://localhost:5173.",
            "docs": "/docs",
        }
