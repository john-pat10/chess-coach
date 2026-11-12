"""Tests for the openings trainer: validation, scheduling, stats, coverage, API."""
import datetime as dt

import pytest

from app import trainer
from app.db import utcnow
from app.models import ReviewState

ITALIAN = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]
SICILIAN = ["e2e4", "c7c5", "g1f3"]


# ---------------------------------------------------------------- validation

def test_add_line_rejects_illegal_and_empty_lines(db):
    with pytest.raises(ValueError, match="not legal"):
        trainer.add_line(db, "white", "Nonsense", ["e2e5"])
    with pytest.raises(ValueError, match="not a valid move"):
        trainer.add_line(db, "white", "Nonsense", ["hello"])
    with pytest.raises(ValueError, match="at least one move"):
        trainer.add_line(db, "white", "Empty", [])
    with pytest.raises(ValueError, match="reply by Black"):
        trainer.add_line(db, "black", "Too short", ["e2e4"])


def test_add_line_is_idempotent_per_colour(db):
    first, created = trainer.add_line(db, "white", "Italian Game", ITALIAN, eco="C50")
    again, created_again = trainer.add_line(db, "white", "Italian Game", ITALIAN, eco="C50")
    as_black, created_black = trainer.add_line(db, "black", "Italian Game", ITALIAN, eco="C50")
    assert created and not created_again and created_black
    assert first.id == again.id != as_black.id
    assert len(trainer.list_lines(db)) == 2


def test_bulk_add_reports_added_skipped_and_unknown(db):
    trainer.add_line(db, "white", "Italian Game", ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"], eco="C50")
    result = trainer.add_openings(db, "white", [("C50", "Italian Game"), ("C60", "Ruy Lopez"), ("Z99", "Nope")])
    assert result["added"] == 1 and result["skipped"] == 1 and len(result["errors"]) == 1


def test_pgn_import_splits_variations_into_lines(db):
    pgn = '[Event "My repertoire"]\n\n1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bb5 a6 *'
    result = trainer.import_pgn(db, "white", pgn)
    assert result["added"] == 2
    lines = {l.moves_uci for l in trainer.list_lines(db)}
    # the main line ends on Black's ...a6, so it is trimmed back to White's Bb5
    assert "e2e4,e7e5,g1f3,b8c6,f1b5" in lines
    assert "e2e4,c7c5,g1f3,d7d6,d2d4" in lines
    assert any("Ruy Lopez" in l.name for l in trainer.list_lines(db))


def test_pgn_import_rejects_garbage(db):
    with pytest.raises(ValueError):
        trainer.import_pgn(db, "white", "   ")


# ---------------------------------------------------------------- scheduling

def test_new_lines_wait_in_learn_queue_not_review(db):
    line, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    assert trainer.stage_of(line.review_state) == "new"
    assert [l.id for l in trainer.queue(db, "learn")] == [line.id]
    assert trainer.queue(db, "review") == []
    assert trainer.queue(db, "drill") == []


def test_learning_a_line_schedules_it_for_tomorrow(db):
    line, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    state = trainer.record_attempt(db, line.id, mode="learn")
    assert state.learned and state.interval_days == 1
    assert trainer.stage_of(state) == "learning"
    assert trainer.queue(db, "learn") == []


def test_clean_reviews_grow_the_interval_and_reach_mastered(db):
    line, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    trainer.record_attempt(db, line.id, mode="learn")
    intervals = []
    for _ in range(4):
        intervals.append(trainer.record_attempt(db, line.id, mode="review").interval_days)
    assert intervals == sorted(intervals) and intervals[0] == 6
    assert intervals[-1] >= trainer.MASTERED_INTERVAL_DAYS
    assert trainer.stage_of(line.review_state) == "mastered"


def test_failed_review_comes_back_in_minutes_and_counts_a_lapse(db):
    line, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    trainer.record_attempt(db, line.id, mode="learn")
    state = trainer.record_attempt(db, line.id, mode="review", mistakes=3)
    assert state.last_result == "again" and state.lapses == 1 and state.repetitions == 0
    assert state.due_at - utcnow() < dt.timedelta(minutes=15)
    assert state.ease_factor < 2.5


def test_grading_from_mistakes_and_hints():
    assert trainer.grade_for(0, 0) == "good"
    assert trainer.grade_for(1, 0) == trainer.grade_for(0, 1) == "hard"
    assert trainer.grade_for(1, 1) == trainer.grade_for(4, 0) == "again"


def test_drill_mode_never_changes_the_schedule(db):
    line, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    trainer.record_attempt(db, line.id, mode="learn")
    before = (line.review_state.due_at, line.review_state.interval_days, line.review_state.ease_factor)
    trainer.record_attempt(db, line.id, mode="drill", mistakes=5)
    after = (line.review_state.due_at, line.review_state.interval_days, line.review_state.ease_factor)
    assert before == after and line.review_state.total_attempts == 2


def test_review_queue_only_holds_due_lines(db):
    a, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    b, _ = trainer.add_line(db, "white", "Sicilian", SICILIAN)
    for line in (a, b):
        trainer.record_attempt(db, line.id, mode="learn")
    a.review_state.due_at = utcnow() - dt.timedelta(days=2)
    db.commit()
    assert [l.id for l in trainer.queue(db, "review")] == [a.id]
    assert {l.id for l in trainer.queue(db, "drill")} == {a.id, b.id}
    assert trainer.queue(db, "review", color="black") == []


def test_unknown_mode_and_missing_line(db):
    with pytest.raises(ValueError):
        trainer.queue(db, "cram")
    assert trainer.record_attempt(db, 999, mode="review") is None


# ---------------------------------------------------------------- stats

def test_stats_counts_stages_streak_and_accuracy(db):
    a, _ = trainer.add_line(db, "white", "Italian Game", ITALIAN)
    trainer.add_line(db, "black", "Sicilian", SICILIAN)
    trainer.record_attempt(db, a.id, mode="learn")
    trainer.record_attempt(db, a.id, mode="drill")                 # clean
    trainer.record_attempt(db, a.id, mode="drill", mistakes=2)     # failed
    s = trainer.stats(db)
    assert s["total_lines"] == 2 and s["new"] == 1 and s["learning"] == 1
    assert s["by_color"]["white"]["learning"] == 1 and s["by_color"]["black"]["new"] == 1
    assert s["day_streak"] == 1 and s["practiced_today"] and s["reviews_today"] == 3
    assert s["accuracy_7d"] == 50
    assert sum(s["forecast"]) == 1 and len(s["activity"]) == 7


def test_stats_on_an_empty_repertoire(db):
    s = trainer.stats(db)
    assert s["total_lines"] == 0 and s["day_streak"] == 0 and s["accuracy_7d"] is None


# ---------------------------------------------------------------- coverage

def test_coverage_finds_unanswered_replies_and_improves_when_filled(db):
    trainer.add_line(db, "white", "Italian Game", ITALIAN)
    before = trainer.coverage(db, "white")
    replies = {(tuple(g["moves"]), g["reply_san"]) for g in before["gaps"]}
    assert (("e2e4",), "c5") in replies            # nothing prepared against the Sicilian
    assert (("e2e4",), "e5") not in replies        # ...but 1...e5 is covered
    sicilian = next(g for g in before["gaps"] if g["reply_san"] == "c5" and g["moves"] == ["e2e4"])
    assert sicilian["leads_to"].startswith("Sicilian") and sicilian["moves_san"] == ["e4"]
    assert before["gaps"][0]["weight"] >= before["gaps"][-1]["weight"]

    trainer.add_line(db, "white", "Sicilian", SICILIAN)
    after = trainer.coverage(db, "white")
    assert after["score"] > before["score"]
    assert (("e2e4",), "c5") not in {(tuple(g["moves"]), g["reply_san"]) for g in after["gaps"]}


def test_coverage_of_an_empty_repertoire(db):
    assert trainer.coverage(db, "black") == {"color": "black", "lines": 0, "score": None, "gap_count": 0, "gaps": []}


# ---------------------------------------------------------------- migration

def test_old_databases_are_upgraded_in_place():
    """A database from the first release (no learned/lapses columns) keeps its data."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db import init_db

    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE repertoire_lines (id INTEGER PRIMARY KEY, color VARCHAR(5), eco VARCHAR(5), "
            "name VARCHAR(200), moves_uci TEXT, source VARCHAR(30), note TEXT, created_at DATETIME)"))
        conn.execute(text(
            "CREATE TABLE review_states (id INTEGER PRIMARY KEY, line_id INTEGER, ease_factor FLOAT, "
            "interval_days FLOAT, repetitions INTEGER, due_at DATETIME, last_result VARCHAR(10), "
            "total_attempts INTEGER, total_correct_first_try INTEGER)"))
        conn.execute(text(
            "INSERT INTO repertoire_lines VALUES "
            "(1,'white','C50','Italian Game','e2e4,e7e5','manual',NULL,'2026-01-01 00:00:00.000000'),"
            "(2,'white','B20','Sicilian','e2e4,c7c5','manual',NULL,'2026-01-01 00:00:00.000000')"))
        conn.execute(text(
            "INSERT INTO review_states VALUES "
            "(1,1,2.5,6,2,'2026-01-07 00:00:00.000000','good',2,2),"
            "(2,2,2.5,0,0,'2026-01-01 00:00:00.000000',NULL,0,0)"))
    init_db(engine)
    init_db(engine)   # running it twice must be harmless
    session = sessionmaker(bind=engine)()
    states = {s.line_id: s for s in session.query(ReviewState)}
    assert states[1].learned and not states[2].learned     # practised lines stay in the cycle
    assert states[1].lapses == 0
    assert trainer.stats(session)["total_lines"] == 2
    session.close()


# ---------------------------------------------------------------- API

def test_api_round_trip(client):
    health = client.get("/api/health").json()
    assert health["status"] == "ok" and health["openings"] > 3000 and "available" in health["stockfish"]

    r = client.post("/api/repertoire", json={"color": "white", "name": "Italian Game", "moves_uci": ITALIAN})
    assert r.status_code == 200 and r.json()["created"] and r.json()["stage"] == "new"
    line_id = r.json()["id"]
    assert [m["san"] for m in r.json()["moves"]] == ["e4", "e5", "Nf3", "Nc6", "Bc4"]

    assert client.post("/api/repertoire", json={"color": "white", "name": "x", "moves_uci": ["e2e5"]}).status_code == 400
    assert client.post("/api/repertoire", json={"color": "green", "name": "x", "moves_uci": ITALIAN}).status_code == 422

    assert [l["id"] for l in client.get("/api/trainer/queue?mode=learn").json()] == [line_id]
    r = client.post("/api/trainer/attempt", json={"line_id": line_id, "mode": "learn"})
    assert r.status_code == 200 and r.json()["stage"] == "learning" and r.json()["due_at"].endswith("Z")
    assert client.post("/api/trainer/attempt", json={"line_id": 12345}).status_code == 404

    bulk = client.post("/api/repertoire/bulk", json={"color": "black", "openings": [{"eco": "C60", "name": "Ruy Lopez"}]})
    assert bulk.json()["added"] == 1
    assert client.get("/api/trainer/stats").json()["total_lines"] == 2
    assert client.get("/api/repertoire/coverage?color=white").json()["gap_count"] > 0

    r = client.patch(f"/api/repertoire/{line_id}", json={"note": "Aim the bishop at f7."})
    assert r.json()["note"] == "Aim the bishop at f7."
    assert client.post("/api/repertoire/delete", json={"ids": [line_id, 999]}).json() == {"deleted": 1}
    assert client.delete(f"/api/repertoire/{line_id}").status_code == 404


def test_api_openings_browsing(client):
    tree = client.get("/api/openings/tree?moves=e2e4").json()
    assert tree["in_book"] and tree["children"][0]["lines"] >= tree["children"][-1]["lines"]
    assert all(c["label"] for c in tree["children"])
    off_book = client.get("/api/openings/tree?moves=a2a4,h7h5,h2h4,a7a5").json()
    assert off_book["in_book"] is False and off_book["children"] == []

    hits = client.get("/api/openings/search?q=dragon sicilian").json()
    assert hits and all("Dragon" in h["name"] and h["pgn"].startswith("1. e4 c5") for h in hits)
    assert client.get("/api/openings/search?q=B70").json()[0]["eco"] == "B70"
    assert client.get("/api/openings/line?eco=Z99&name=Nope").status_code == 404
    assert client.get("/api/nope").status_code == 404
