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

export function search(query, limit = 25) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const o of allNamed) {
    if (o.name.toLowerCase().includes(q)) {
      out.push({ eco: o.eco, name: o.name });
      if (out.length >= limit) break;
    }
  }
  return out;
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
