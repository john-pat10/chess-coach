// A small PGN reader/writer that understands headers, comments, NAGs and
// nested variations, and builds a move tree:
//
//   node = { id, san, uci, fen, ply, children: [node, ...], comment? }
//
// children[0] is always the main line. Illegal or unreadable moves raise an
// error naming the move, rather than silently cutting the game short.
import { Chess, DEFAULT_POSITION } from "chess.js";

let nextId = 1;
export const newId = () => `n${nextId++}`;

export function makeRoot(fen = DEFAULT_POSITION) {
  return { id: "root", san: null, uci: null, fen, ply: 0, children: [] };
}

const toUci = (m) => m.from + m.to + (m.promotion ?? "");

/** Ply count implied by a FEN (0 for the start position). */
export function fenPly(fen) {
  const parts = fen.split(" ");
  const full = Number(parts[5] || 1);
  return (full - 1) * 2 + (parts[1] === "b" ? 1 : 0);
}

/** Play `move` (SAN string or {from,to,promotion}) from `node`; returns child (existing or new). */
export function addMove(node, move) {
  const chess = new Chess(node.fen);
  const m = chess.move(move); // throws if illegal
  const uci = toUci(m);
  let child = node.children.find((c) => c.uci === uci);
  if (!child) {
    child = { id: newId(), san: m.san, uci, fen: chess.fen(), ply: node.ply + 1, children: [] };
    node.children.push(child);
  }
  return child;
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "{") {
      const end = text.indexOf("}", i);
      const stop = end === -1 ? text.length : end;
      tokens.push({ type: "comment", value: text.slice(i + 1, stop).trim() });
      i = stop + 1;
    } else if (c === ";") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
    } else if (c === "(" || c === ")") {
      tokens.push({ type: c });
      i++;
    } else if (c === "$") {
      const m = /^\$\d+/.exec(text.slice(i));
      i += m ? m[0].length : 1;
    } else {
      const m = /^[^\s(){};]+/.exec(text.slice(i));
      tokens.push({ type: "word", value: m[0] });
      i += m[0].length;
    }
  }
  return tokens;
}

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function cleanSan(word) {
  // Strip move numbers glued to the move ("12.Nf3", "12...Nf3") and
  // annotation glyphs ("Nf3!?", "e4+!").
  let w = word.replace(/^\d+\.+/, "");
  w = w.replace(/[!?]+$/, "");
  w = w.replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
  return w;
}

function moveLabel(node) {
  const n = Math.floor(node.ply / 2) + 1;
  return node.ply % 2 === 0 ? `${n}. (White)` : `${n}... (Black)`;
}

/**
 * Parse a single PGN game. Returns
 *   { headers, startFen, root, mainline: [{san, uci, fenBefore, fenAfter}] }
 */
export function parsePgn(text) {
  const headers = {};
  const body = text
    .replace(/\r/g, "")
    .replace(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm, (_, k, v) => {
      headers[k] = v.replace(/\\"/g, '"');
      return "";
    })
    .trim();

  let startFen = DEFAULT_POSITION;
  if (headers.FEN) {
    try {
      new Chess(headers.FEN);
      startFen = headers.FEN;
    } catch {
      throw new Error(`The FEN header isn't a valid position: ${headers.FEN}`);
    }
  }
  const root = makeRoot(startFen);
  root.ply = fenPly(startFen);

  const tokens = tokenize(body);
  // Stack of [current node, node the variation branches from].
  let current = root;
  let lastParent = null; // parent of the most recent move, for "(" variations
  const stack = [];

  for (const t of tokens) {
    if (t.type === "comment") {
      if (current) current.comment = current.comment ? `${current.comment} ${t.value}` : t.value;
      continue;
    }
    if (t.type === "(") {
      stack.push({ current, lastParent });
      // A variation replaces the last move played, so branch from its parent.
      current = lastParent ?? current;
      lastParent = null;
      continue;
    }
    if (t.type === ")") {
      const s = stack.pop();
      if (s) ({ current, lastParent } = s);
      continue;
    }
    const word = t.value;
    if (RESULT.test(word)) continue;
    if (/^\d+\.+$/.test(word)) continue;
    const san = cleanSan(word);
    if (!san) continue;
    try {
      const parent = current;
      current = addMove(current, san);
      lastParent = parent;
    } catch {
      const label = moveLabel({ ply: current.ply });
      throw new Error(
        `Move ${label} "${word}" isn't a legal move in that position. ` +
          `Check the spelling (pieces are uppercase K Q R B N, files are lowercase a-h).`
      );
    }
  }

  const mainline = [];
  let node = root;
  while (node.children.length) {
    const next = node.children[0];
    mainline.push({ san: next.san, uci: next.uci, fenBefore: node.fen, fenAfter: next.fen });
    node = next;
  }
  return { headers, startFen, root, mainline };
}

/** Split a multi-game PGN file into individual game texts. */
export function splitGames(text) {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n(?=\s*\[Event )/)
    .map((g) => g.trim())
    .filter(Boolean);
}

/** Write a move tree back out as PGN text (with variations). */
export function writePgn(root, headers = {}) {
  const out = [];
  const startFen = root.fen;
  const h = { ...headers };
  if (startFen !== DEFAULT_POSITION) {
    h.SetUp = "1";
    h.FEN = startFen;
  }
  for (const [k, v] of Object.entries(h)) out.push(`[${k} "${String(v).replace(/"/g, '\\"')}"]`);
  if (out.length) out.push("");

  function moveText(node, forceNumber) {
    const n = Math.floor((node.ply - 1) / 2) + 1;
    const white = node.ply % 2 === 1;
    let s = white ? `${n}. ${node.san}` : forceNumber ? `${n}... ${node.san}` : node.san;
    if (node.comment) s += ` {${node.comment}}`;
    return s;
  }

  function line(node, forceNumber) {
    // `node` has just been reached; write its continuation.
    const parts = [];
    let cur = node;
    let force = forceNumber;
    while (cur.children.length) {
      const [main, ...alts] = cur.children;
      parts.push(moveText(main, force));
      force = false;
      for (const alt of alts) {
        parts.push(`(${[moveText(alt, true), line(alt, false)].filter(Boolean).join(" ")})`);
        force = true;
      }
      cur = main;
    }
    return parts.join(" ");
  }

  out.push(`${line(root, true)} ${headers.Result ?? "*"}`.trim());
  return out.join("\n");
}
