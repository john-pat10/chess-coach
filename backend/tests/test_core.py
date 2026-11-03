"""A handful of fast smoke tests for the non-network parts of the backend.

Run with: cd backend && .venv/bin/pytest
(Requires Stockfish to be installed for test_analyze_finds_the_blunder.)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.openings import get_book
from app.eval_utils import cp_to_win_percent, accuracy_from_avg_win_loss, format_cp


def test_opening_book_loads_and_classifies():
    book = get_book()
    assert len(book._all_named) > 3000  # the full lichess-org dataset
    result = book.classify(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])
    assert result["eco"] == "C60"
    assert "Ruy Lopez" in result["name"]


def test_opening_book_moves_for_roundtrip():
    book = get_book()
    moves = book.moves_for("C50", "Italian Game")
    assert moves is not None
    assert moves[0] == "e2e4"


def test_win_percent_curve_is_centered_and_monotonic():
    assert cp_to_win_percent(0) == pytest.approx(50.0)
    assert cp_to_win_percent(500) > cp_to_win_percent(100) > cp_to_win_percent(0)
    assert cp_to_win_percent(-500) < cp_to_win_percent(-100) < cp_to_win_percent(0)


def test_accuracy_formula_bounds():
    assert accuracy_from_avg_win_loss(0) == pytest.approx(100.0, abs=1)
    assert 0 <= accuracy_from_avg_win_loss(100) <= 100


def test_format_cp():
    assert format_cp(140) == "+1.40"
    assert format_cp(-25) == "-0.25"
    assert format_cp(9990).startswith("#")


def test_analyze_finds_the_blunder():
    """End-to-end check that requires a real Stockfish install."""
    pytest.importorskip("chess.engine")
    from app.analysis import analyze_game
    from app.engine import locate_stockfish

    try:
        locate_stockfish()
    except RuntimeError:
        pytest.skip("Stockfish not installed -- skipping engine-backed test.")

    pgn = (
        '[Event "Test"]\n[Result "1-0"]\n\n'
        "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0\n"
    )
    result = analyze_game(pgn, depth=10, critical_depth=12)
    classifications = {m["ply"]: m["classification"] for m in result["moves"]}
    assert classifications[6] == "Blunder"  # 3...Nf6??
    assert result["summary"]["White"]["accuracy"] > result["summary"]["Black"]["accuracy"]


def test_repertoire_and_sm2_scheduling():
    """Uses a throwaway in-memory database so this doesn't touch your real repertoire."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import models  # noqa: F401 -- ensure models are registered on Base
    from app import trainer as trainer_module
    from app.db import Base

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()

    line = trainer_module.add_line(session, "white", "Italian Game", ["e2e4", "e7e5"], eco="C50")
    assert trainer_module.get_due_line(session).id == line.id

    state = trainer_module.record_attempt(session, line.id, "good")
    assert state.repetitions == 1
    assert state.interval_days == 1.0
    session.close()
