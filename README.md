# ChessCoach

[![CI](https://github.com/john-pat10/chess-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/john-pat10/chess-coach/actions/workflows/ci.yml)

A personal chess-improvement app that runs on your own computer, with three tools:

1. **Game Review**: paste a PGN and get a move-by-move walkthrough. Every move
   is classified (Brilliant / Best / Excellent / Good / Book / Inaccuracy /
   Mistake / Blunder), with plain-English commentary, an eval graph, and the
   engine's suggested lines at the moments you went wrong.
2. **Opponent Scout**: enter a Lichess or chess.com username and it pulls
   their public games, classifies each by opening, and shows which openings
   they score worst in, so you know what to steer the game into.
3. **Openings Trainer**: build a repertoire and learn it with spaced
   repetition. See [The Openings Trainer](#the-openings-trainer) below.

Analysis runs on a local [Stockfish](https://stockfishchess.org/). Nothing is
sent to an analysis service; the only network calls are to Lichess's and
chess.com's public APIs to fetch a player's games.

## Run it

You need [Python 3.10+](https://www.python.org/downloads/) and
[Node.js 20+](https://nodejs.org/). Then, from this folder:

```bash
python run.py
```

On Windows you can double-click `start.bat` instead; on macOS/Linux, `./start.sh`.

The first run takes a minute or two. It:

- creates a Python environment in `backend/.venv` and installs the backend,
- installs the frontend packages and builds the web app,
- looks for Stockfish and, if it's missing, **offers to download it** into
  `backend/bin` (about 80 MB, from the official Stockfish GitHub releases),
- starts the app and opens it in your browser at **http://localhost:8000**.

Later runs start in a few seconds. Everything is installed inside this
folder; delete the folder and it's gone. Press `Ctrl+C` in the terminal to stop.

| Command | What it does |
|---|---|
| `python run.py` | Set up if needed, then start the app |
| `python run.py --check` | Report what's installed and what's missing, change nothing |
| `python run.py --dev` | Developer mode: auto-reloading backend and Vite dev server |
| `python run.py --port 9000` | Use another port (it also moves by itself if 8000 is busy) |
| `python run.py --yes` | Download Stockfish without asking |
| `python run.py --no-browser` | Don't open the browser |

### Or with Docker

No Python, Node or Stockfish needed, only Docker:

```bash
docker compose up --build
```

Then open http://localhost:8000. Your repertoire is kept in a Docker volume,
so it survives rebuilds.

### If something goes wrong

- **"Python was not found"** on Windows: install it from
  [python.org](https://www.python.org/downloads/) and tick *Add python.exe to
  PATH*. The Microsoft Store version often doesn't work.
- **"Node.js was not found"** right after installing it: open a new terminal
  window so it picks up the new PATH.
- **Game Review says Stockfish is missing**: run `python run.py` again and
  answer yes to the download, or install it yourself (`brew install
  stockfish`, `sudo apt install stockfish`, or the
  [Windows download](https://stockfishchess.org/download/)) and, if it still
  isn't found, copy `backend/.env.example` to `backend/.env` and set
  `STOCKFISH_PATH` to the executable or the folder it's in. The other two
  tools work without Stockfish.
- **The page says the backend isn't running**: the terminal window that
  started it was closed. Run `python run.py` again; the page reconnects by itself.
- `python run.py --check` shows exactly which piece is missing.

## The Openings Trainer

A line moves through three stages: **new** → **learning** → **mastered**.

**Building a repertoire** (the *Add lines* tab)

- **Search** 3,800 named openings by name or ECO code, and add one line or a
  whole family ("sicilian dragon") at once.
- **Explore** move by move on a board. Book moves are listed with the opening
  they lead to; you can also play your own moves to add lines that aren't in
  any book.
- **Import a PGN**, such as a Lichess study export. Every variation becomes
  its own line.
- Or start from a one-click starter set, or from the Opponent Scout's
  recommendations.

**Training** (the *Train* tab)

- **Learn** shows a new line with arrows, then has you repeat it from memory.
- **Review** is spaced repetition: play each due line from memory. Grading is
  automatic from your mistakes and hints. A clean run pushes the line further
  out (1 day, 6 days, then growing); a failed one comes back within minutes.
- **Drill** plays learned lines in random order until your first mistake, and
  keeps your best streak. It never changes the review schedule.
- Wrong moves aren't just rejected: a second miss on the same move shows the
  answer, a hint button reveals the piece and then the move, and a move that
  belongs to a *different* line of yours isn't counted against you.
- Lines that share their first moves are played back to back, and the shared
  moves are skipped the second time.

**Tracking** (the *Repertoire* and *Coverage* tabs)

- The dashboard shows your day streak, accuracy, mastered count, and how many
  reviews are coming up each day this week.
- Lines are grouped by opening, with notes you can attach to each line.
- **Coverage** finds holes: positions your lines reach where the opponent has
  a known reply that none of your lines answers, biggest first, with one click
  to add an answer.

## How it works

```
run.py              one-command setup and launcher (standard library only)
backend/
  app/
    main.py        FastAPI app: the REST API, and it serves the built web app
    engine.py      finds and talks to your local Stockfish (via python-chess)
    analysis.py    runs a game through Stockfish, classifies every move,
                   writes the commentary
    eval_utils.py  centipawn <-> win% <-> accuracy% conversions (the same
                   formulas lichess's analysis board uses)
    openings.py    loads the ECO opening database into a move trie
    opponent.py    Lichess / chess.com API clients and the scouting report
    trainer.py     repertoire, SM-2 spaced-repetition scheduling, stats,
                   coverage analysis, PGN import
    models.py/db.py  SQLite via SQLAlchemy, with in-place upgrades of older databases
  data/*.tsv       lichess-org/chess-openings dataset (MIT licensed)
  tests/           pytest suite (the engine test is skipped without Stockfish)
frontend/
  src/pages/       the three tools
  src/trainer/     the openings trainer's screens
  src/components/  shared Board and EvalBar
  src/api.js       REST client
```

Your repertoire and review history live in `backend/chess_coach.db`, a plain
SQLite file. Back it up to keep your progress; set `CHESS_COACH_DB` to keep it
somewhere else.

### Development

```bash
python run.py --dev                    # backend with auto-reload + Vite at :5173
cd backend && python -m pytest         # backend tests (use the venv's python)
cd frontend && npm run lint && npm run build
```

Interactive API docs are at http://localhost:8000/docs while the app runs.
GitHub Actions runs the tests, the frontend build, and a clean-machine setup
on Windows, macOS and Linux for every push.

### A note on move classification

There's no single standard for "Brilliant" vs "Best" vs "Blunder"; chess.com
and lichess each use their own heuristics. This project uses lichess's public
win% formula (`50 + 50 * (2/(1+e^-0.00368*cp) - 1)`) to turn Stockfish's
centipawn scores into a win probability, then classifies each move by how
much win% it gave up. "Brilliant" is a best-effort heuristic (the engine's
best move, and it looks like a material sacrifice), so it won't always agree
with chess.com.

### A note on coverage

Coverage is measured against the bundled opening book, not a database of real
games. A reply's weight is the number of named openings that follow it, which
tracks how much theory a move has rather than exactly how often it is played.

### Ideas for extending it

- Replace the rule-based commentary in `analysis.py` with an LLM call that
  gets the position and engine lines, and check its claims against Stockfish.
- Weight coverage by real move frequencies from the Lichess opening explorer.
- Schedule individual positions rather than whole lines.
