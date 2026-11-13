# ChessCoach

**Use it here: https://john-pat10.github.io/chess-coach/** (no install, no account)

A personal chess-improvement app with four tools in one place:

1. **Game Review**: paste a PGN and get a chess.com-style walkthrough. Every
   move is classified (Brilliant / Best / Excellent / Good / Book /
   Inaccuracy / Mistake / Blunder) with plain-English commentary, an eval
   bar, accuracy scores, and the engine's suggested lines at the moments you
   went wrong.
2. **Analysis Board**: a Lichess-style board for free analysis.
   - Move pieces for either side (drag or click) and see Stockfish's
     evaluation and its top 1-5 lines update live, with a best-move arrow.
     Click any move in an engine line to play it out.
   - A variation tree: try side lines without losing the main line, step
     through any branch, promote a variation, or delete from a move.
   - Load a PGN (variations and comments are kept) or a FEN, then copy the
     result back out as PGN or FEN.
   - An opening explorer that names the opening and lists the book moves
     from the current position, transpositions included.
   - From Game Review, the **Analysis board** button opens the game at the
     move you're looking at.
   - Keys: ← → step, ↑ ↓ jump to start/end, `f` flips the board, `l`
     toggles the engine. Your last analysis is saved between visits.
3. **Opponent Scout**: enter a Lichess or chess.com username. It pulls their
   public games, classifies every game by opening (from a 3,800-line ECO
   opening database), and shows which openings they score worst in, so you
   know what to steer the game into.
4. **Openings Trainer**: build a repertoire (manually, or straight from
   Opponent Scout's recommendations) and drill it with spaced repetition
   (the SM-2 algorithm Anki uses), so lines you keep missing come back
   sooner.

## How it runs

Everything runs in your browser. There's no server:

- **Stockfish 19** (the [stockfish.js](https://github.com/nmrugg/stockfish.js)
  WASM build, GPLv3) runs in a Web Worker on your own device. It uses the
  single-threaded "lite" build, which needs no special server setup, so the
  whole app can be hosted as static files on GitHub Pages.
- The only network calls are to Lichess's and chess.com's public, keyless
  APIs, when you scout an opponent.
- Your repertoire and review schedule are saved in your browser
  (localStorage). Use **Download backup** / **Restore backup** on the
  Openings Trainer page to move them to another browser or device.

## Running it locally

You only need this if you want to change the code. Install
[Node.js](https://nodejs.org/) 18+ and then:

- **Windows:** double-click `start.bat`
- **macOS/Linux:** `./start.sh`

Or by hand:

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

## Publishing to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the app and publishes
it on every push to `main`. One-time setup: in the repo, go to
**Settings → Pages** and set **Source** to **GitHub Actions**. After the
first run, the site is live at `https://<your-username>.github.io/chess-coach/`.

## Project layout

```
frontend/
  src/
    pages/          GameReview, AnalysisBoard, OpponentScout, OpeningsTrainer
    components/     shared Board + EvalBar
    lib/
      engine.js     Stockfish in a Web Worker (UCI over postMessage)
      analysis.js   runs a game through Stockfish, classifies every move,
                    writes the commentary
      evalUtils.js  centipawn <-> win% <-> accuracy% (lichess's formulas)
      pgn.js        PGN reader/writer with variations, comments and clear
                    errors for illegal moves
      openings.js   the opening book: move trie + position index
      opponent.js   Lichess / chess.com fetching + the scouting report
      trainer.js    repertoire + SM-2 scheduling in localStorage
    data/openings.json   generated from data/*.tsv
  data/*.tsv        lichess-org/chess-openings dataset (MIT licensed)
  scripts/
    copy-engine.mjs     copies Stockfish into public/engine/ (runs automatically)
    build-openings.mjs  regenerates src/data/openings.json from the TSVs
```

### A note on move classification

There's no single official standard for "Brilliant" vs "Best" vs
"Blunder". chess.com and lichess each use their own heuristics, and
chess.com doesn't publish its version. This project uses lichess's public
win% formula (`50 + 50 * (2/(1+e^-0.00368*cp) - 1)`) to turn Stockfish's
centipawn scores into a 0-100% win probability, then classifies each move
by how much win% it gave up. "Brilliant" is a best-effort heuristic: the
best engine move that also looks like a material sacrifice. It's usually
right, but it won't always match what chess.com says about the same move.

The browser engine is the "lite" Stockfish (a smaller neural network than
desktop Stockfish), at depth 16 per move. It's far stronger than any human,
but its evaluations can differ slightly from a full desktop Stockfish.

## Licenses

- Stockfish / stockfish.js: GPLv3 (`frontend/public/engine/COPYING.txt` is
  copied in at build time).
- Opening data: lichess-org/chess-openings, MIT.
