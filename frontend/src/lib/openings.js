// Opening book built from the lichess-org/chess-openings dataset (MIT),
// pre-converted to src/data/openings.json by scripts/build-openings.mjs.
//
// - A move trie (keyed by UCI) for classifying games by their move order.
// - A position index (keyed by FEN without move counters) for the analysis
//   board's opening explorer, so transpositions are recognised. Built lazily
//   the first time it's needed.
import { Chess } from "chess.js";
import rows from "../data/openings.json";

function makeNode(uci = null) {
  return { uci, eco: null, name: null, children: new Map() };
}

const root = makeNode();
const allNamed = []; // { eco, name, ucis }
const byKey = new Map(); // "ECO|Name" -> ucis

for (const [eco, name, moveStr] of rows) {
  const ucis = moveStr ? moveStr.split(" ") : [];
  let node = root;
  for (const u of ucis) {
    if (!node.children.has(u)) node.children.set(u, makeNode(u));
    node = node.children.get(u);
  }
  node.eco = eco;
  node.name = name;
  allNamed.push({ eco, name, ucis });
  byKey.set(`${eco}|${name}`, ucis);
}

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** Deepest named opening along a move sequence: {eco, name, ply} or null. */
export function classify(ucis) {
  let node = root;
  let best = null;
  for (let i = 0; i < ucis.length; i++) {
    node = node.children.get(ucis[i]);
    if (!node) break;
    if (node.name) best = { eco: node.eco, name: node.name, ply: i + 1 };
  }
  return best;
}

/** Tree node after a move sequence, with children's SAN filled in. */
export function nodeAt(ucis) {
  let node = root;
  const chess = new Chess();
  for (const u of ucis) {
    node = node.children.get(u);
    if (!node) return null;
    chess.move(uciToMove(u));
  }
  const children = [...node.children.values()].map((c) => {
    const m = new Chess(chess.fen()).move(uciToMove(c.uci));
    return { move: c.uci, san: m.san, eco: c.eco, name: c.name };
  });
  const last = ucis.length ? chess.history().at(-1) : null;
  return { move: node.uci, san: last, eco: node.eco, name: node.name, children };
}

export function movesFor(eco, name) {
  return byKey.get(`${eco}|${name}`) ?? null;
}

// ---------------------------------------------------------------- search

// Lowercase, drop accents and apostrophes ("Queen's" -> "queens"), and turn
// all other punctuation into spaces, so "queens gambit", "Queen's Gambit" and
// "queen's-gambit" all look the same.
function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019`]/g, "")
    .replace(/[^a-z0-9+#=]+/g, " ")
    .trim();
}

// Common shorthand people type, expanded before matching.
const ALIASES = {
  qgd: "queens gambit declined",
  qga: "queens gambit accepted",
  qg: "queens gambit",
  kid: "kings indian defense",
  kia: "kings indian attack",
  qid: "queens indian defense",
  ruy: "ruy lopez",
  spanish: "ruy lopez",
  sicilian: "sicilian defense",
  french: "french defense",
  caro: "caro kann",
  carokann: "caro kann",
  scandi: "scandinavian",
  grunfeld: "grunfeld",
  gruenfeld: "grunfeld",
  london: "london system",
  italian: "italian game",
  scotch: "scotch game",
  defence: "defense",
};

// Edit distance capped at 2, used for typo tolerance on longer words.
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// How well one query word matches the words of a name: 3 exact, 2 prefix,
// 1 typo, 0 no match.
function wordScore(q, words) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 3;
    if (w.startsWith(q)) best = Math.max(best, 2);
    else if (best < 1 && q.length >= 4 && within(q, w.slice(0, q.length + 1), q.length >= 7 ? 2 : 1)) best = 1;
  }
  return best;
}

// Per-opening search fields, built once on first search.
let searchIndex = null;
function getSearchIndex() {
  if (searchIndex) return searchIndex;
  searchIndex = allNamed.map((o) => {
    const norm = normalize(o.name);
    const [familyName, ...rest] = o.name.split(":");
    const family = normalize(familyName);
    const variation = normalize(rest.join(" "));
    let san = null; // filled lazily for move searches
    return { o, norm, words: norm.split(" "), family, familyWords: family.split(" "), variation, get san() {
      if (san === null) {
        const chess = new Chess();
        san = o.ucis.map((u) => normalize(chess.move(uciToMove(u)).san)).join(" ");
      }
      return san;
    } };
  });
  return searchIndex;
}

// Result row: name, ECO and the line in readable notation ("1. d4 d5 2. c4").
function toResult(e) {
  const chess = new Chess();
  const parts = [];
  e.o.ucis.forEach((u, i) => {
    const san = chess.move(uciToMove(u)).san;
    parts.push(i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san);
  });
  return { eco: e.o.eco, name: e.o.name, moves: parts.join(" ") };
}

const MOVE_TOKEN = /^(\d+\.*)?([kqrbn]?[a-h]?[1-8]?x?[a-h][1-8](=?[qrbn])?|o-o(-o)?|0-0(-0)?)[+#]?$/i;

/**
 * Search named openings. Understands:
 *  - names in any word order, with or without apostrophes/accents, small typos
 *    ("queens gambit", "dragon sicilian", "najdrof")
 *  - shorthand like QGD, KID, Ruy, Caro
 *  - ECO codes ("B33")
 *  - move sequences ("1. e4 c5 2. Nf3 d6", "d4 d5 c4")
 * Results are ranked: closest name matches first, and within a family the
 * main line before its sub-variations.
 */
export function search(query, limit = 300) {
  const raw = query.trim();
  if (!raw) return [];
  const index = getSearchIndex();

  // ECO code, e.g. "C42". (One digit would clash with moves like "e4".)
  if (/^[a-e]\d\d$/i.test(raw)) {
    const code = raw.toUpperCase();
    return index
      .filter((e) => e.o.eco.startsWith(code))
      .sort((a, b) => a.o.eco.localeCompare(b.o.eco) || a.o.ucis.length - b.o.ucis.length)
      .slice(0, limit)
      .map(toResult);
  }

  // Move sequence: every token looks like a move or a move number.
  const tokens = raw.replace(/\.(?=\S)/g, ". ").split(/\s+/).filter((t) => !/^\d+\.*$/.test(t));
  if (tokens.length && tokens.every((t) => MOVE_TOKEN.test(t))) {
    const want = tokens.map((t) => normalize(t.replace(/^\d+\.*/, "").replace(/0/g, "o"))).join(" ");
    return index
      .filter((e) => e.san === want || e.san.startsWith(want + " "))
      .sort((a, b) => a.o.ucis.length - b.o.ucis.length)
      .slice(0, limit)
      .map(toResult);
  }

  // Name search.
  let q = normalize(raw);
  q = q.split(" ").map((w) => ALIASES[w] ?? w).join(" ");
  const qWords = q.split(" ").filter(Boolean);
  const scored = [];
  for (const e of index) {
    let total = 0;
    let ok = true;
    for (const w of qWords) {
      const s = wordScore(w, e.words);
      if (!s) { ok = false; break; }
      total += s;
    }
    if (!ok) continue;
    // Bonuses: the whole phrase appears in order, it names the family itself.
    if (e.norm.includes(q)) total += 4;
    if (e.family.startsWith(q)) total += 4;
    if (e.family === q) total += 3;
    // Every query word that names part of the family counts (typos included),
    // so "sicilan dragon" ranks Sicilian lines above "Franco-Sicilian" ones.
    if (qWords.some((w) => wordScore(w, e.familyWords))) {
      total += 3 * qWords.filter((w) => wordScore(w, e.familyWords)).length;
    }
    // A query word that starts the variation name ("Dragon Variation").
    if (e.variation && qWords.some((w) => !wordScore(w, e.familyWords) && (e.variation.startsWith(w + " ") || e.variation === w))) total += 2;
    scored.push({ e, total });
  }
  scored.sort((a, b) =>
    b.total - a.total ||
    a.e.family.localeCompare(b.e.family) ||
    a.e.o.ucis.length - b.e.o.ucis.length ||
    a.e.o.name.localeCompare(b.e.o.name)
  );
  return scored.slice(0, limit).map(({ e }) => toResult(e));
}

// ---------------------------------------------------------------- position index

export function positionKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

let positionIndex = null;

function buildPositionIndex() {
  // key -> { eco, name, next: Map(uci -> {uci, san, names:Set}) }
  const index = new Map();
  const get = (key) => {
    let e = index.get(key);
    if (!e) {
      e = { eco: null, name: null, next: new Map() };
      index.set(key, e);
    }
    return e;
  };
  // Walk the trie depth-first so each position is computed once.
  const chess = new Chess();
  function walk(node) {
    const key = positionKey(chess.fen());
    const entry = get(key);
    if (node.name && !entry.name) {
      entry.eco = node.eco;
      entry.name = node.name;
    }
    for (const child of node.children.values()) {
      const m = chess.move(uciToMove(child.uci));
      if (!entry.next.has(child.uci)) {
        entry.next.set(child.uci, { uci: child.uci, san: m.san, count: 0 });
      }
      entry.next.get(child.uci).count += countNamed(child);
      walk(child);
      chess.undo();
    }
  }
  walk(root);
  return index;
}

const namedCount = new Map();
function countNamed(node) {
  if (namedCount.has(node)) return namedCount.get(node);
  let n = node.name ? 1 : 0;
  for (const c of node.children.values()) n += countNamed(c);
  namedCount.set(node, n);
  return n;
}

/**
 * Opening explorer data for a position: its name (if it's a named book
 * position) and the book moves from it, most-covered first.
 */
export function explorePosition(fen) {
  if (!positionIndex) positionIndex = buildPositionIndex();
  const entry = positionIndex.get(positionKey(fen));
  if (!entry) return null;
  const moves = [...entry.next.values()].sort((a, b) => b.count - a.count);
  return { eco: entry.eco, name: entry.name, moves };
}
