// Full-game analysis for Game Review: per-move eval, classification,
// commentary, and alternative lines at the critical moments. A port of the
// original Python backend, running against in-browser Stockfish.
import { Chess } from "chess.js";
import { classify } from "./openings.js";
import {
  MATE_SCORE_CP,
  accuracyFromAvgWinLoss,
  cpToWinPercent,
  formatCp,
  scoreToCp,
} from "./evalUtils.js";
import { parsePgn } from "./pgn.js";

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const INACCURACY_WP_LOSS = 5;
const MISTAKE_WP_LOSS = 10;
const BLUNDER_WP_LOSS = 20;
const EXCELLENT_WP_LOSS = 2;

const uciToMove = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

/** Engine line (side-to-move POV) -> centipawns from White's POV. */
function whiteCp(line, fen) {
  const cp = scoreToCp(line);
  return fen.split(" ")[1] === "w" ? cp : -cp;
}

/** Did the mover leave the moved piece where something cheaper can take it? */
function looksLikeSacrifice(fenBefore, uci) {
  const board = new Chess(fenBefore);
  const move = board.move(uciToMove(uci));
  if (move.piece === "p") return false;
  const movedValue = PIECE_VALUES[move.promotion ?? move.piece];
  let cheapest = null;
  for (const reply of board.moves({ verbose: true })) {
    if (reply.to !== move.to || !reply.captured) continue;
    const cost = PIECE_VALUES[reply.piece];
    if (cheapest === null || cost < cheapest) cheapest = cost;
  }
  return cheapest !== null && cheapest < movedValue;
}

export function pvToSan(fen, pv, maxMoves = 6) {
  const b = new Chess(fen);
  const parts = [];
  for (let i = 0; i < Math.min(pv.length, maxMoves); i++) {
    const white = b.turn() === "w";
    const num = b.moveNumber();
    let m;
    try {
      m = b.move(uciToMove(pv[i]));
    } catch {
      break;
    }
    const prefix = white ? `${num}.` : i === 0 ? `${num}...` : "";
    parts.push(prefix ? `${prefix}${m.san}` : m.san);
  }
  return parts.join(" ");
}

export function classifyMove(playedIsBest, wpLoss, inBook, brilliant) {
  if (inBook) return "Book";
  if (playedIsBest) return brilliant ? "Brilliant" : "Best";
  if (wpLoss < EXCELLENT_WP_LOSS) return "Excellent";
  if (wpLoss < INACCURACY_WP_LOSS) return "Good";
  if (wpLoss < MISTAKE_WP_LOSS) return "Inaccuracy";
  if (wpLoss < BLUNDER_WP_LOSS) return "Mistake";
  return "Blunder";
}

function commentary(san, cls, mover, bestSan, evalBefore, evalAfter, punishSan) {
  const other = mover === "White" ? "Black" : "White";
  switch (cls) {
    case "Book":
      return `${san} is a well-known book move.`;
    case "Brilliant":
      return `${san}!! is a brilliant move -- it looks risky but is objectively the strongest move here, keeping ${mover} firmly ahead.`;
    case "Best":
      return `${san} is the engine's top choice in this position.`;
    case "Excellent":
      return `${san} is an excellent move, nearly as strong as the top engine line${
        bestSan && bestSan !== san ? ` (best was ${bestSan})` : ""
      }.`;
    case "Good":
      return `${san} is a reasonable, solid move.`;
    case "Inaccuracy":
      return `${san} is a slight inaccuracy.${bestSan ? ` ${bestSan} kept a firmer grip on the position.` : ""}`;
    case "Mistake":
      return `${san} is a mistake, giving ${other} the upper hand.${
        punishSan ? ` ${punishSan} presses the advantage.` : ""
      }${bestSan ? ` ${bestSan} was correct instead.` : ""}`;
    default:
      return `${san} is a blunder.${
        punishSan ? ` After ${punishSan}, the evaluation swings to ${evalAfter}.` : ""
      }${bestSan ? ` ${bestSan} would have kept things under control (${evalBefore}).` : ""}`;
  }
}

/**
 * Analyse a whole game. `onProgress(done, total)` is called as positions are
 * evaluated so the UI can show a progress bar.
 */
export async function analyzeGame(engine, pgnText, { depth = 12, criticalDepth = 16, onProgress } = {}) {
  const game = parsePgn(pgnText); // throws a readable error on bad moves
  const headers = game.headers;
  const mainline = game.mainline; // [{san, uci, fenBefore, fenAfter}]
  if (!mainline.length) throw new Error("This game has no moves to analyze.");

  const ucis = mainline.map((m) => m.uci);
  const opening = classify(ucis);
  const bookPly = opening ? opening.ply : 0;

  const startFen = game.startFen;
  const movesData = [];
  const evals = [0];
  const fensBefore = [];

  // Count positions so progress is honest: start + one per move + critical.
  const total = mainline.length + 1;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const startBoard = new Chess(startFen);
  let best = null;
  if (!startBoard.isGameOver()) {
    const [line] = await engine.analyse(startFen, { depth });
    evals[0] = whiteCp(line, startFen);
    best = line.pv[0] ?? null;
  }
  tick();

  for (let i = 0; i < mainline.length; i++) {
    const { san, uci, fenBefore, fenAfter } = mainline[i];
    const mover = fenBefore.split(" ")[1] === "w" ? "White" : "Black";
    fensBefore.push(fenBefore);

    const playedIsBest = uci === best;
    const inBook = i + 1 <= bookPly;
    const brilliant = playedIsBest && !inBook ? looksLikeSacrifice(fenBefore, uci) : false;
    const bestSanBefore = best && best !== uci ? new Chess(fenBefore).move(uciToMove(best)).san : null;

    const cpBefore = evals.at(-1);
    const wpBefore = cpToWinPercent(mover === "White" ? cpBefore : -cpBefore);

    const after = new Chess(fenAfter);
    let cpAfter;
    let nextBest = null;
    if (after.isCheckmate()) {
      cpAfter = mover === "White" ? MATE_SCORE_CP : -MATE_SCORE_CP;
    } else if (after.isGameOver()) {
      cpAfter = 0;
    } else {
      const [line] = await engine.analyse(fenAfter, { depth });
      cpAfter = whiteCp(line, fenAfter);
      nextBest = line.pv[0] ?? null;
    }
    evals.push(cpAfter);
    tick();

    const punishSan = nextBest ? new Chess(fenAfter).move(uciToMove(nextBest)).san : null;
    const wpAfter = cpToWinPercent(mover === "White" ? cpAfter : -cpAfter);
    const wpLoss = Math.max(0, wpBefore - wpAfter);
    const cls = classifyMove(playedIsBest, wpLoss, inBook, brilliant);
    const evalBefore = formatCp(cpBefore);
    const evalAfter = formatCp(cpAfter);

    movesData.push({
      ply: i + 1,
      move_number: Math.floor(i / 2) + 1,
      color: mover,
      san,
      uci,
      classification: cls,
      eval_before_cp: cpBefore,
      eval_after_cp: cpAfter,
      eval_after_str: evalAfter,
      win_percent_loss: Math.round(wpLoss * 10) / 10,
      best_move_san: bestSanBefore,
      comment: commentary(san, cls, mover, bestSanBefore, evalBefore, evalAfter, punishSan),
      fen_before: fenBefore,
      fen_after: fenAfter,
    });
    best = nextBest;
  }

  // Second pass: alternative lines for the worst moments.
  const critical = movesData
    .map((m, i) => i)
    .filter((i) => ["Mistake", "Blunder"].includes(movesData[i].classification))
    .sort((a, b) => movesData[b].win_percent_loss - movesData[a].win_percent_loss)
    .slice(0, 12)
    .sort((a, b) => a - b);

  for (const i of critical) {
    const fen = fensBefore[i];
    const lines = await engine.analyse(fen, { depth: criticalDepth, multipv: 3 });
    movesData[i].alternative_lines = lines
      .filter((l) => l.pv.length)
      .map((l) => {
        const cp = whiteCp(l, fen);
        return { eval_str: formatCp(cp), eval_cp: cp, line_san: pvToSan(fen, l.pv) };
      });
  }

  const summary = {};
  for (const side of ["White", "Black"]) {
    const sideMoves = movesData.filter((m) => m.color === side);
    const counts = {};
    for (const m of sideMoves) counts[m.classification] = (counts[m.classification] ?? 0) + 1;
    const scored = sideMoves.filter((m) => m.classification !== "Book");
    const avg = scored.length ? scored.reduce((s, m) => s + m.win_percent_loss, 0) / scored.length : 0;
    summary[side] = {
      accuracy: Math.round(accuracyFromAvgWinLoss(avg) * 10) / 10,
      counts,
      blunders: counts.Blunder ?? 0,
      mistakes: counts.Mistake ?? 0,
      inaccuracies: counts.Inaccuracy ?? 0,
    };
  }

  return {
    headers,
    opening,
    start_fen: startFen,
    moves: movesData,
    eval_graph_white_cp: evals,
    summary,
  };
}
