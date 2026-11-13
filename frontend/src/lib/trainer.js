// Repertoire storage + SM-2 spaced repetition, kept in the browser's
// localStorage (so each person who opens the site has their own repertoire).
// exportRepertoire/importRepertoire let people back it up or move browsers.
import { Chess } from "chess.js";
import { uciToMove } from "./openings.js";

const KEY = "chesscoach.repertoire.v1";
const GRADE_TO_QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };
const DAY = 24 * 60 * 60 * 1000;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked or corrupt -- start fresh */
  }
  return { nextId: 1, lines: [] };
}

function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error("Couldn't save your repertoire -- browser storage may be full or disabled.");
  }
}

/** Expand UCI moves into the {uci, from, to, promotion, san, fen_after} list the UI uses. */
export function uciMovesToLine(ucis) {
  const chess = new Chess();
  const out = [];
  for (const uci of ucis) {
    let m;
    try {
      m = chess.move(uciToMove(uci));
    } catch {
      break;
    }
    out.push({
      uci,
      from: m.from,
      to: m.to,
      promotion: m.promotion ?? null,
      san: m.san,
      fen_after: chess.fen(),
    });
  }
  return out;
}

function toDict(line) {
  const s = line.review;
  return {
    id: line.id,
    color: line.color,
    eco: line.eco,
    name: line.name,
    source: line.source,
    note: line.note,
    moves: uciMovesToLine(line.moves_uci),
    review: {
      ...s,
      is_due: new Date(s.due_at).getTime() <= Date.now(),
    },
  };
}

export function listLines() {
  return load()
    .lines.slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toDict);
}

export function addLine({ color, name, moves_uci, eco = null, source = "manual", note = null }) {
  const db = load();
  const now = new Date().toISOString();
  const line = {
    id: db.nextId++,
    color,
    eco,
    name,
    moves_uci,
    source,
    note,
    created_at: now,
    review: {
      due_at: now,
      interval_days: 0,
      ease_factor: 2.5,
      repetitions: 0,
      last_result: null,
      total_attempts: 0,
      total_correct_first_try: 0,
    },
  };
  db.lines.push(line);
  save(db);
  return toDict(line);
}

export function deleteLine(id) {
  const db = load();
  const before = db.lines.length;
  db.lines = db.lines.filter((l) => l.id !== id);
  save(db);
  return db.lines.length !== before;
}

export function nextDue() {
  const now = Date.now();
  const due = load()
    .lines.filter((l) => new Date(l.review.due_at).getTime() <= now)
    .sort((a, b) => a.review.due_at.localeCompare(b.review.due_at));
  return due.length ? toDict(due[0]) : null;
}

export function summary() {
  const lines = load().lines;
  const now = Date.now();
  return {
    total_lines: lines.length,
    due_now: lines.filter((l) => new Date(l.review.due_at).getTime() <= now).length,
  };
}

function sm2(state, quality) {
  if (quality < 3) {
    state.repetitions = 0;
    state.interval_days = 1;
  } else {
    if (state.repetitions === 0) state.interval_days = 1;
    else if (state.repetitions === 1) state.interval_days = 6;
    else state.interval_days = Math.round(state.interval_days * state.ease_factor * 100) / 100;
    state.repetitions += 1;
  }
  const ef = state.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  state.ease_factor = Math.max(1.3, Math.round(ef * 1000) / 1000);
  state.due_at = new Date(Date.now() + state.interval_days * DAY).toISOString();
}

export function recordAttempt(id, result) {
  if (!(result in GRADE_TO_QUALITY)) throw new Error(`Unknown result '${result}'.`);
  const db = load();
  const line = db.lines.find((l) => l.id === id);
  if (!line) throw new Error("Line not found.");
  const s = line.review;
  s.total_attempts += 1;
  if ((result === "good" || result === "easy") && s.repetitions === 0) s.total_correct_first_try += 1;
  s.last_result = result;
  sm2(s, GRADE_TO_QUALITY[result]);
  save(db);
  return { ...s };
}

export function exportRepertoire() {
  return JSON.stringify(load(), null, 2);
}

/** Merge lines from an exported file; skips lines already present. Returns count added. */
export function importRepertoire(text) {
  let incoming;
  try {
    incoming = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a ChessCoach repertoire backup.");
  }
  if (!incoming || !Array.isArray(incoming.lines)) {
    throw new Error("That file isn't a ChessCoach repertoire backup.");
  }
  const db = load();
  const existing = new Set(db.lines.map((l) => `${l.color}|${l.moves_uci.join(",")}`));
  let added = 0;
  for (const l of incoming.lines) {
    if (!Array.isArray(l.moves_uci) || !l.review) continue;
    const key = `${l.color}|${l.moves_uci.join(",")}`;
    if (existing.has(key)) continue;
    db.lines.push({ ...l, id: db.nextId++ });
    existing.add(key);
    added++;
  }
  save(db);
  return added;
}
