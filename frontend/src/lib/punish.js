// Helpers for the "Punish the mistake" lessons: turning the SAN lines in
// data/punishLessons.js into board positions, tracking which lessons you've
// solved (in localStorage), and matching lessons to your repertoire.
import { Chess } from "chess.js";
import { LESSONS, sanTokens } from "../data/punishLessons.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROGRESS_KEY = "chesscoach.punish.v1";

/**
 * Expand a lesson into everything the drill needs:
 *  startFen   -- position the lesson opens on (before the opponent's mistake)
 *  mistake    -- {san, from, to, fenAfter} or null for "decide" lessons
 *  steps      -- the punishment line: [{san, from, to, promotion, fenBefore,
 *                fenAfter, byUser, alts: [{san, from, to, promotion}]}]
 *  setupUcis  -- setup + mistake as UCI, for repertoire matching
 */
export function buildLesson(lesson) {
  const chess = new Chess(lesson.fen ?? START_FEN);
  const setupUcis = [];
  for (const san of sanTokens(lesson.setup)) {
    const m = chess.move(san);
    setupUcis.push(m.from + m.to + (m.promotion ?? ""));
  }
  const startFen = chess.fen();
  let mistake = null;
  if (lesson.mistake) {
    const m = chess.move(lesson.mistake);
    mistake = { san: m.san, from: m.from, to: m.to, fenAfter: chess.fen() };
    setupUcis.push(m.from + m.to + (m.promotion ?? ""));
  }
  const userColor = lesson.side === "white" ? "w" : "b";
  const steps = sanTokens(lesson.punish).map((san, i) => {
    const fenBefore = chess.fen();
    const byUser = chess.turn() === userColor;
    const alts = (lesson.alts?.[i] ?? []).map((a) => {
      const probe = new Chess(fenBefore);
      const am = probe.move(a);
      return { san: am.san, from: am.from, to: am.to, promotion: am.promotion ?? null };
    });
    const m = chess.move(san);
    return {
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion ?? null,
      fenBefore,
      fenAfter: chess.fen(),
      byUser,
      alts,
      note: byUser ? null : lesson.notes?.[m.san] ?? lesson.notes?.[san] ?? null,
      moveNumber: Number(fenBefore.split(" ")[5]),
      white: fenBefore.split(" ")[1] === "w",
    };
  });
  let better = null;
  if (lesson.better) {
    const probe = new Chess(startFen);
    const bm = probe.move(sanTokens(lesson.better)[0]);
    better = { san: bm.san, from: bm.from, to: bm.to };
  }
  return { ...lesson, startFen, mistake, steps, setupUcis, better };
}

let built = null;
export function allLessons() {
  if (!built) built = LESSONS.map(buildLesson);
  return built;
}

/** "8. Bxd5+" / "8... Qxd5" style label for a step. */
export function stepLabel(step) {
  return step.white ? `${step.moveNumber}. ${step.san}` : `${step.moveNumber}... ${step.san}`;
}

/** A run of steps in normal notation: "6. Nxf7 Kxf7 7. Qf3+ Ke6". */
export function formatLine(steps) {
  return steps
    .map((s, i) => (s.white ? `${s.moveNumber}. ${s.san}` : i === 0 ? `${s.moveNumber}... ${s.san}` : s.san))
    .join(" ");
}

// ---------------------------------------------------------------- progress

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function recordResult(id, clean) {
  const p = loadProgress();
  const prev = p[id] ?? { attempts: 0, clean: 0 };
  p[id] = {
    attempts: prev.attempts + 1,
    clean: prev.clean + (clean ? 1 : 0),
    last: new Date().toISOString(),
    lastClean: clean,
  };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable -- progress just isn't remembered */
  }
  return p;
}

// ---------------------------------------------------------------- repertoire

/**
 * Does this lesson come up in a repertoire line you play as the same colour?
 * True when the line and the lesson's moves agree for as long as both run
 * (at least the first 4 plies), i.e. one is a continuation of the other.
 */
export function inRepertoire(lesson, repertoireLines) {
  if (lesson.type !== "move") return false;
  return repertoireLines.some((line) => {
    if (line.color !== lesson.side) return false;
    const a = line.moves_uci ?? (line.moves ?? []).map((m) => m.uci);
    const b = lesson.setupUcis;
    const n = Math.min(a.length, b.length);
    if (n < 4) return false;
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
    return true;
  });
}
