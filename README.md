# ChessCoach

A personal chess-improvement app with three tools in one place:

1. **Game Review** -- paste a PGN and get a chess.com-style walkthrough: every
   move is classified (Brilliant / Best / Excellent / Good / Book /
   Inaccuracy / Mistake / Blunder), with plain-English commentary, an eval
   graph, and the engine's suggested lines at the moments you went wrong.
2. **Opponent Scout** -- enter a Lichess or chess.com username and it pulls
   their public game history, classifies every game by opening (using a
   3,800-line ECO opening database), and tells you which openings they
   actually score worst in -- so you know what to steer the game into.
3. **Openings Trainer** -- build a repertoire (manually, or straight from
   Opponent Scout's recommendations) and drill it with spaced repetition
   (the same SM-2 algorithm Anki uses), so lines you keep missing come back
   sooner.

Analysis runs on a real [Stockfish](https://stockfishchess.org/) (open
source, GPLv3) running locally on your machine -- nothing is sent to a
third-party analysis service. The only network calls this app makes are to
Lichess's and chess.com's own public, keyless APIs, to fetch a player's
public games.

## Requirements

- Python 3.10+
- Node.js 18+
- Stockfish (see below)

### Installing Stockfish

- **macOS:** `brew install stockfish`
- **Ubuntu/Debian:** `sudo apt install stockfish`
- **Windows:** download the binary from
  [stockfishchess.org/download](https://stockfishchess.org/download/) and
  either add its folder to your PATH, or set the `STOCKFISH_PATH`
  environment variable to the full path of `stockfish.exe`.

The backend looks for Stockfish on your PATH automatically; if it can't find
it, copy `backend/.env.example` to `backend/.env` and set `STOCKFISH_PATH`
to the full path of the executable -- it's loaded automatically on startup.

## Quick start

**Windows:** double-click `start.bat`. First run, it'll install everything
it needs (this can take a minute or two); after that it opens two windows
(backend + frontend) and your browser, straight to the app. If Python or
Node aren't installed yet, it'll tell you exactly where to get them and stop
-- install those and double-click it again.

A couple of Windows-specific things worth knowing:
- If double-clicking does nothing or flashes and closes, right-click
  `start.bat` and choose "Run as administrator" once, or open a Command
  Prompt in this folder and run `start.bat` from there so you can see any
  error message.
- If you installed Python from the Microsoft Store, the `python` command
  can sometimes silently fail to find real Python. If `start.bat` says
  Python isn't found even though you're sure it's installed, reinstall from
  [python.org](https://www.python.org/downloads/) instead and check "Add
  python.exe to PATH".
- To stop the app, just close the two windows it opened.
- Prefer to run them separately? `backend\run_backend.bat` and
  `frontend\run_frontend.bat` each do one half, and can be double-clicked on
  their own once the first-time setup above has run once via `start.bat`.

**macOS/Linux:**

```bash
./start.sh
```

Both platforms: this sets up the backend virtualenv and frontend
dependencies on first run, then starts both. Open **http://localhost:5173**.

## Manual setup

**Backend** (in one terminal):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (in another terminal):

```bash
cd frontend
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## How it works

```
backend/
  app/
    engine.py      -- finds + talks to your local Stockfish (via python-chess)
    eval_utils.py  -- centipawn <-> win% <-> accuracy% conversions (same
                       formulas lichess's own analysis board uses)
    analysis.py    -- runs a full game through Stockfish, classifies every
                       move, and writes the natural-language commentary
    openings.py    -- loads the bundled ECO opening database into a move
                       trie, for both classifying games and browsing openings
    opponent.py    -- Lichess / chess.com API clients + the scouting report
    trainer.py     -- repertoire storage + SM-2 spaced-repetition scheduling
    models.py/db.py-- SQLite (via SQLAlchemy) for your repertoire
    main.py        -- FastAPI app tying it all together
  data/*.tsv        -- lichess-org/chess-openings dataset (MIT licensed),
                       ~3,800 named opening lines
frontend/
  src/pages/        -- the three tools (GameReview, OpponentScout, OpeningsTrainer)
  src/components/   -- shared Board + EvalBar
  src/api.js        -- talks to the backend REST API
```

Your repertoire and review schedule live in `backend/chess_coach.db` (a
plain SQLite file) -- back it up if you want to keep your progress safe.

### A note on move classification

There's no single official standard for "Brilliant" vs "Best" vs
"Blunder" -- chess.com and lichess each use their own (unpublished, in
chess.com's case) heuristics. This project uses lichess's public win%
formula (`50 + 50 * (2/(1+e^-0.00368*cp) - 1)`) to convert Stockfish's
centipawn scores into a 0-100% win probability, then classifies each move
by how much win% it gave up. "Brilliant" is a best-effort heuristic (best
engine move + it looks like a material sacrifice) -- it'll be right most
of the time but won't always agree with what chess.com would say about the
exact same move.

### Extending it

Some natural next steps if you want to keep building on this:
- Swap the rule-based commentary in `analysis.py` for something that calls
  an LLM (e.g. the Claude API) with the position + engine lines, for richer
  explanations.
- Add a PyTorch position evaluator alongside Stockfish and compare the two
  (this was on the original idea list -- skipped here to ship the core app
  first, but `analysis.py` is the place to plug it in).
- Deploy the backend somewhere reachable and point the frontend at it, so
  you can use this from your phone.
