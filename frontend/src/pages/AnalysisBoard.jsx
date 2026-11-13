import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, DEFAULT_POSITION, validateFen } from "chess.js";
import Board from "../components/Board.jsx";
import EvalBar from "../components/EvalBar.jsx";
import { Engine } from "../lib/engine.js";
import { formatCp, scoreToCp } from "../lib/evalUtils.js";
import { explorePosition, uciToMove } from "../lib/openings.js";
import { addMove, fenPly, makeRoot, parsePgn, writePgn } from "../lib/pgn.js";

const SAVE_KEY = "chesscoach.analysis.v1";
const IMPORT_KEY = "chesscoach.analysis.import";
const MAX_DEPTH = 22;

// ---------------------------------------------------------------- tree helpers

/** id -> { node, parent } for every node in the tree. */
function indexTree(root) {
  const map = new Map();
  const walk = (node, parent) => {
    map.set(node.id, { node, parent });
    for (const c of node.children) walk(c, node);
  };
  walk(root, null);
  return map;
}

function pathTo(index, id) {
  const path = [];
  let entry = index.get(id);
  while (entry) {
    path.unshift(entry.node);
    entry = entry.parent ? index.get(entry.parent.id) : null;
  }
  return path;
}

function moveNumberLabel(node, force) {
  const n = Math.floor((node.ply - 1) / 2) + 1;
  if (node.ply % 2 === 1) return `${n}.`;
  return force ? `${n}...` : "";
}

/** Engine line (side-to-move POV) -> { cp (White POV), evalStr, sans } */
function describeLine(fen, line) {
  const stmCp = scoreToCp(line);
  const cp = fen.split(" ")[1] === "w" ? stmCp : -stmCp;
  const chess = new Chess(fen);
  const sans = [];
  for (const u of line.pv.slice(0, 12)) {
    try {
      const white = chess.turn() === "w";
      const num = chess.moveNumber();
      const m = chess.move(uciToMove(u));
      sans.push({ uci: u, san: m.san, label: white ? `${num}.` : sans.length === 0 ? `${num}...` : "" });
    } catch {
      break;
    }
  }
  return { cp, evalStr: formatCp(cp), sans, depth: line.depth };
}

function loadSaved() {
  try {
    const imp = sessionStorage.getItem(IMPORT_KEY);
    if (imp) {
      sessionStorage.removeItem(IMPORT_KEY);
      const { pgn, ply } = JSON.parse(imp);
      const game = parsePgn(pgn);
      let node = game.root;
      for (let i = 0; i < ply && node.children.length; i++) node = node.children[0];
      return { root: game.root, currentId: node.id, headers: pickHeaders(game.headers) };
    }
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const { pgn, path } = JSON.parse(saved);
      const game = parsePgn(pgn);
      let node = game.root;
      for (const u of path) {
        const next = node.children.find((c) => c.uci === u);
        if (!next) break;
        node = next;
      }
      return { root: game.root, currentId: node.id, headers: pickHeaders(game.headers) };
    }
  } catch {
    /* fall through to a fresh board */
  }
  return { root: makeRoot(), currentId: "root", headers: {} };
}

function pickHeaders(h) {
  const out = {};
  for (const k of ["White", "Black", "Event", "Date", "Result"]) if (h[k]) out[k] = h[k];
  return out;
}

// ---------------------------------------------------------------- move tree view

function MoveTree({ root, currentId, onSelect }) {
  const out = [];

  function moveSpan(node, force, key) {
    return (
      <span
        key={key}
        className={`tree-move ${node.id === currentId ? "active" : ""}`}
        onClick={() => onSelect(node.id)}
        title={node.comment || undefined}
      >
        {moveNumberLabel(node, force) && <span className="tree-num">{moveNumberLabel(node, force)}</span>}
        {node.san}
      </span>
    );
  }

  // Renders the line that continues from `node`, inline. Nested variations
  // appear in parentheses.
  function inlineLine(node, force, keyPrefix) {
    const parts = [];
    let cur = node;
    let f = force;
    let i = 0;
    while (cur.children.length) {
      const [main, ...alts] = cur.children;
      parts.push(moveSpan(main, f, `${keyPrefix}-${i++}`));
      f = false;
      for (const alt of alts) {
        parts.push(
          <span key={`${keyPrefix}-v${alt.id}`} className="tree-sub">
            ({moveSpan(alt, true, `${alt.id}-m`)} {inlineLine(alt, false, alt.id)})
          </span>
        );
        f = true;
      }
      cur = main;
    }
    return parts;
  }

  // Main line flows inline; its direct variations get their own indented block.
  let cur = root;
  let force = true;
  let row = [];
  let k = 0;
  while (cur.children.length) {
    const [main, ...alts] = cur.children;
    row.push(moveSpan(main, force, `m${k++}`));
    force = false;
    if (alts.length) {
      out.push(<div key={`r${k}`} className="tree-main">{row}</div>);
      row = [];
      out.push(
        <div key={`v${k}`} className="tree-variations">
          {alts.map((alt) => (
            <div key={alt.id} className="tree-variation">
              {moveSpan(alt, true, `${alt.id}-m`)} {inlineLine(alt, false, alt.id)}
            </div>
          ))}
        </div>
      );
      force = true;
    }
    cur = main;
  }
  if (row.length) out.push(<div key="rlast" className="tree-main">{row}</div>);
  if (!out.length) return <div className="hint">Make a move on the board to start.</div>;
  return <div className="move-tree">{out}</div>;
}

// ---------------------------------------------------------------- page

export default function AnalysisBoard() {
  const initial = useMemo(loadSaved, []);
  const rootRef = useRef(initial.root);
  const [currentId, setCurrentId] = useState(initial.currentId);
  const [headers, setHeaders] = useState(initial.headers);
  const [version, setVersion] = useState(0); // bump to re-render after tree edits
  const [orientation, setOrientation] = useState("white");
  const [engineOn, setEngineOn] = useState(true);
  const [multipv, setMultipv] = useState(3);
  const [engineState, setEngineState] = useState({ fen: null, lines: [], done: false });
  const [engineError, setEngineError] = useState(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(null);
  const [selected, setSelected] = useState(null); // click-to-move source square
  const [copied, setCopied] = useState(null);
  const engineRef = useRef(null);

  const root = rootRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => indexTree(root), [root, version]);
  const current = index.get(currentId)?.node ?? root;
  const path = useMemo(() => pathTo(index, current.id), [index, current.id]);
  const fen = current.fen;
  const position = useMemo(() => new Chess(fen), [fen]);

  // ---- persistence: keep the last analysis across reloads
  useEffect(() => {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ pgn: writePgn(root, headers), path: path.slice(1).map((n) => n.uci) })
      );
    } catch {
      /* storage unavailable -- not fatal */
    }
  }, [root, headers, path, version]);

  // ---- engine lifecycle
  useEffect(() => {
    const eng = new Engine();
    engineRef.current = eng;
    eng.ready.catch((e) => setEngineError(e.message));
    return () => eng.terminate();
  }, []);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!engineOn || position.isGameOver()) {
      eng.stop();
      return;
    }
    setEngineState({ fen, lines: [], done: false });
    eng.startInfinite(fen, {
      multipv,
      maxDepth: MAX_DEPTH,
      onInfo: (lines, done) => setEngineState({ fen, lines, done }),
    });
    return () => eng.stop();
  }, [fen, engineOn, multipv, position]);

  const lines = useMemo(
    () =>
      engineState.fen === fen
        ? engineState.lines.filter((l) => l.pv.length).map((l) => describeLine(fen, l))
        : [],
    [engineState, fen]
  );

  // ---- tree edits
  const playMove = useCallback(
    (move, from = current) => {
      try {
        const child = addMove(from, move);
        setVersion((v) => v + 1);
        setCurrentId(child.id);
        return child;
      } catch {
        return null;
      }
    },
    [current]
  );

  function playLine(ucis) {
    let node = current;
    for (const u of ucis) {
      const next = (() => {
        try {
          return addMove(node, uciToMove(u));
        } catch {
          return null;
        }
      })();
      if (!next) break;
      node = next;
    }
    setVersion((v) => v + 1);
    setCurrentId(node.id);
  }

  function onPieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare) return false;
    setSelected(null);
    return !!playMove({ from: sourceSquare, to: targetSquare, promotion: "q" });
  }

  function onSquareClick({ square }) {
    if (selected) {
      if (selected !== square && playMove({ from: selected, to: square, promotion: "q" })) {
        setSelected(null);
        return;
      }
    }
    const piece = position.get(square);
    setSelected(piece && piece.color === position.turn() ? square : null);
  }

  function promote() {
    let child = current;
    let parentEntry = index.get(child.id)?.parent;
    while (parentEntry) {
      const parent = parentEntry;
      const i = parent.children.indexOf(child);
      if (i > 0) {
        parent.children.splice(i, 1);
        parent.children.unshift(child);
        setVersion((v) => v + 1);
        return;
      }
      child = parent;
      parentEntry = index.get(parent.id)?.parent;
    }
  }

  function deleteFromHere() {
    const parent = index.get(current.id)?.parent;
    if (!parent) return;
    parent.children = parent.children.filter((c) => c !== current);
    setVersion((v) => v + 1);
    setCurrentId(parent.id);
  }

  function resetBoard(startFen = DEFAULT_POSITION) {
    const r = makeRoot(startFen);
    r.ply = fenPly(startFen);
    rootRef.current = r;
    setHeaders({});
    setVersion((v) => v + 1);
    setCurrentId("root");
  }

  function handleImport(e) {
    e.preventDefault();
    const text = importText.trim();
    setImportError(null);
    if (!text) return;
    if (!text.includes("[") && text.split("/").length === 8) {
      const v = validateFen(text);
      if (!v.ok) {
        setImportError(`That FEN isn't valid: ${v.error}`);
        return;
      }
      resetBoard(text);
      setImportText("");
      return;
    }
    try {
      const game = parsePgn(text);
      rootRef.current = game.root;
      setHeaders(pickHeaders(game.headers));
      setVersion((v) => v + 1);
      setCurrentId("root");
      setImportText("");
    } catch (err) {
      setImportError(err.message);
    }
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("error");
    }
  }

  // ---- keyboard navigation
  useEffect(() => {
    function onKey(e) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const parent = index.get(current.id)?.parent;
      if (e.key === "ArrowLeft" && parent) setCurrentId(parent.id);
      else if (e.key === "ArrowRight" && current.children.length) setCurrentId(current.children[0].id);
      else if (e.key === "ArrowUp") setCurrentId(root.id);
      else if (e.key === "ArrowDown") {
        let n = current;
        while (n.children.length) n = n.children[0];
        setCurrentId(n.id);
      } else if (e.key === "f") setOrientation((o) => (o === "white" ? "black" : "white"));
      else if (e.key === "l") setEngineOn((on) => !on);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, current, root]);

  // ---- opening explorer
  const explorer = useMemo(() => explorePosition(fen), [fen]);
  const openingName = useMemo(() => {
    for (let i = path.length - 1; i >= 0; i--) {
      const e = explorePosition(path[i].fen);
      if (e?.name) return `${e.eco} · ${e.name}`;
    }
    return null;
  }, [path]);

  // ---- board decorations
  const squareStyles = {};
  if (current.uci) {
    const hl = { background: "rgba(155, 199, 0, 0.35)" };
    squareStyles[current.uci.slice(0, 2)] = hl;
    squareStyles[current.uci.slice(2, 4)] = hl;
  }
  if (selected) {
    squareStyles[selected] = { background: "rgba(79, 163, 227, 0.45)" };
    for (const m of position.moves({ square: selected, verbose: true })) {
      squareStyles[m.to] = {
        ...squareStyles[m.to],
        backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 24%)",
      };
    }
  }
  if (position.inCheck()) {
    const board = position.board().flat().filter(Boolean);
    const king = board.find((p) => p.type === "k" && p.color === position.turn());
    if (king) squareStyles[king.square] = { background: "radial-gradient(circle, rgba(220,40,40,0.8) 0%, transparent 70%)" };
  }

  const arrows =
    engineOn && lines[0]?.sans[0]
      ? [{ startSquare: lines[0].sans[0].uci.slice(0, 2), endSquare: lines[0].sans[0].uci.slice(2, 4), color: "rgba(21, 120, 27, 0.75)" }]
      : [];

  const evalCp = lines[0]?.cp ?? (position.isCheckmate() ? (position.turn() === "w" ? -10000 : 10000) : 0);
  let status = null;
  if (position.isCheckmate()) status = `Checkmate -- ${position.turn() === "w" ? "Black" : "White"} wins`;
  else if (position.isStalemate()) status = "Stalemate";
  else if (position.isInsufficientMaterial()) status = "Draw by insufficient material";
  else if (position.isThreefoldRepetition()) status = "Threefold repetition";

  const parent = index.get(current.id)?.parent;
  const isVariation = path.some((n, i) => i > 0 && path[i - 1].children[0] !== n);

  return (
    <div className="grid-2 analysis-grid">
      <div>
        <div className="flex-row" style={{ alignItems: "flex-start" }}>
          <EvalBar cp={evalCp} />
          <Board
            id="analysis"
            fen={fen}
            orientation={orientation}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            squareStyles={squareStyles}
            arrows={arrows}
            allowDragging
          />
        </div>
        <div className="board-controls">
          <button className="btn-secondary btn" title="Start (↑)" onClick={() => setCurrentId(root.id)}>|◀</button>
          <button className="btn-secondary btn" title="Back (←)" disabled={!parent} onClick={() => parent && setCurrentId(parent.id)}>◀</button>
          <button
            className="btn-secondary btn"
            title="Forward (→)"
            disabled={!current.children.length}
            onClick={() => current.children.length && setCurrentId(current.children[0].id)}
          >
            ▶
          </button>
          <button
            className="btn-secondary btn"
            title="End of line (↓)"
            onClick={() => {
              let n = current;
              while (n.children.length) n = n.children[0];
              setCurrentId(n.id);
            }}
          >
            ▶|
          </button>
          <button className="btn-secondary btn" title="Flip board (f)" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
            ⇅ Flip
          </button>
        </div>
        <div className="hint" style={{ textAlign: "center", marginTop: 6 }}>
          Drag or click pieces to move · ← → to step · f flips · l toggles the engine · right-click drag to draw arrows
        </div>

        <div className="panel mt-2">
          <div className="section-title">Load a game or position</div>
          <form onSubmit={handleImport} className="flex-col">
            <textarea
              className="pgn-input"
              style={{ minHeight: 90 }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste a PGN (variations are kept) or a FEN"
            />
            <div className="flex-row" style={{ flexWrap: "wrap" }}>
              <button className="btn" type="submit">Load</button>
              <button className="btn-secondary btn" type="button" onClick={() => resetBoard()}>
                New board
              </button>
              <button className="btn-secondary btn" type="button" onClick={() => copy(writePgn(root, headers), "PGN")}>
                Copy PGN
              </button>
              <button className="btn-secondary btn" type="button" onClick={() => copy(fen, "FEN")}>
                Copy FEN
              </button>
              {copied && <span className="hint">{copied === "error" ? "Couldn't copy" : `${copied} copied`}</span>}
            </div>
          </form>
          {importError && <div className="error-box mt-1">{importError}</div>}
          <div className="hint mt-1" style={{ wordBreak: "break-all" }}>FEN: {fen}</div>
        </div>
      </div>

      <div className="flex-col">
        <div className="panel">
          <div className="flex-row" style={{ justifyContent: "space-between" }}>
            <label className="flex-row" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
              <span style={{ fontWeight: 700 }}>Stockfish 19</span>
              {engineOn && lines[0] && (
                <span className="hint">
                  depth {lines[0].depth}
                  {engineState.done ? "" : "…"}
                </span>
              )}
            </label>
            <select value={multipv} onChange={(e) => setMultipv(Number(e.target.value))} title="Number of lines">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} line{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
          {engineError && <div className="error-box mt-1">{engineError}</div>}
          {status ? (
            <div className="commentary-box mt-1">{status}</div>
          ) : engineOn ? (
            <div className="engine-lines mt-1">
              {lines.length === 0 && <div className="hint">Thinking…</div>}
              {lines.map((l, i) => (
                <div key={i} className="engine-line">
                  <span className={`eval-pill ${l.cp >= 0 ? "pos" : "neg"}`}>{l.evalStr}</span>
                  <span className="engine-pv">
                    {l.sans.map((s, j) => (
                      <span
                        key={j}
                        className="pv-move"
                        onClick={() => playLine(l.sans.slice(0, j + 1).map((x) => x.uci))}
                      >
                        {s.label && <span className="tree-num">{s.label}</span>}
                        {s.san}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="hint mt-1">Engine off.</div>
          )}
        </div>

        <div className="panel">
          <div className="section-title">{openingName ?? "Opening explorer"}</div>
          {explorer?.moves.length ? (
            <div className="flex-row" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
              {explorer.moves.map((m) => (
                <button
                  key={m.uci}
                  className="btn-secondary btn book-move"
                  title={`${m.count} named line${m.count === 1 ? "" : "s"} in the book`}
                  onClick={() => playMove(uciToMove(m.uci))}
                >
                  {m.san} <span className="hint">{m.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="hint">
              {explorer ? "End of the book for this line." : "This position isn't in the opening book."}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="section-title" style={{ margin: 0 }}>
              {headers.White || headers.Black ? `${headers.White ?? "?"} vs ${headers.Black ?? "?"}` : "Moves"}
            </div>
            <div className="flex-row">
              <button className="btn-secondary btn btn-sm" disabled={!isVariation} onClick={promote} title="Make this variation the main line">
                Promote
              </button>
              <button className="btn-secondary btn btn-sm" disabled={!parent} onClick={deleteFromHere} title="Delete this move and everything after it">
                Delete from here
              </button>
            </div>
          </div>
          <div className="mt-1">
            <MoveTree root={root} currentId={current.id} onSelect={setCurrentId} />
          </div>
          {current.comment && <div className="commentary-box mt-1">{current.comment}</div>}
        </div>
      </div>
    </div>
  );
}
