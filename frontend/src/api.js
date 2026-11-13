// Everything runs in the browser now -- no backend server. This module keeps
// the same `api` shape the pages were written against, backed by:
//   lib/engine.js   -- Stockfish (WASM) in a Web Worker
//   lib/analysis.js -- game review
//   lib/opponent.js -- Lichess / chess.com scouting
//   lib/openings.js -- the bundled opening book
//   lib/trainer.js  -- repertoire + spaced repetition in localStorage
import { Engine } from "./lib/engine.js";
import { analyzeGame } from "./lib/analysis.js";
import { buildScoutingReport } from "./lib/opponent.js";
import * as book from "./lib/openings.js";
import * as trainer from "./lib/trainer.js";

let reviewEngine = null;
function getReviewEngine() {
  reviewEngine ??= new Engine();
  return reviewEngine;
}

export const api = {
  analyze: (pgn, { depth = 16, criticalDepth = 20, onProgress } = {}) =>
    analyzeGame(getReviewEngine(), pgn, { depth, criticalDepth, onProgress }),

  scoutOpponent: (platform, username, maxGames = 100) =>
    buildScoutingReport(platform, username, Math.max(5, Math.min(500, maxGames))),

  openingsTree: async (movesUci = []) => {
    const node = book.nodeAt(movesUci);
    if (!node) throw new Error("No opening line matches those moves.");
    return node;
  },

  openingsSearch: async (q, limit = 60) => book.search(q, limit),

  openingsLine: async (eco, name) => {
    const moves = book.movesFor(eco, name);
    if (!moves) throw new Error("Unknown opening.");
    return { eco, name, moves: trainer.uciMovesToLine(moves) };
  },

  listRepertoire: async () => trainer.listLines(),
  addRepertoireLine: async (line) => trainer.addLine(line),
  deleteRepertoireLine: async (id) => trainer.deleteLine(id),
  trainerSummary: async () => trainer.summary(),
  trainerNext: async () => trainer.nextDue(),
  trainerAttempt: async (lineId, result) => trainer.recordAttempt(lineId, result),
  exportRepertoire: () => trainer.exportRepertoire(),
  importRepertoire: async (text) => trainer.importRepertoire(text),
};
