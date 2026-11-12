import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "../components/Board.jsx";
import { api } from "../api.js";
import { movesText, plural } from "./util.js";

function resultText(res, color) {
  let text = `Added ${plural(res.added, "line")} as ${color}`;
  if (res.skipped) text += `, skipped ${res.skipped} you already had`;
  return text + ".";
}

// ------------------------------------------------------------------ search

function Search({ onChanged }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      setResults(await api.openingsSearch(query.trim(), 200));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function add(rows, color) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.addOpenings(color, rows);
      setStatus(resultText(res, color));
      if (res.errors.length) setError(res.errors.join(" "));
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-col">
      <form onSubmit={search} className="flex-row">
        <input
          placeholder="e.g. sicilian dragon, Caro-Kann, B90"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
          aria-label="Search openings"
        />
        <button className="btn" type="submit" disabled={busy || query.trim().length < 2}>Search</button>
      </form>
      <div className="hint">
        Searches 3,800 named openings by name or ECO code. Search a whole family, then add every
        variation at once.
      </div>
      {status && <div className="ok-text" role="status">{status}</div>}
      {error && <div className="error-box">{error}</div>}
      {results && results.length === 0 && <div className="hint">No openings match "{query}".</div>}
      {results && results.length > 0 && (
        <>
          <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="hint">{plural(results.length, "matching line")}{results.length === 200 ? " (showing the first 200)" : ""}</div>
            <div className="flex-row">
              <button className="btn btn-secondary" disabled={busy} onClick={() => add(results, "white")}>Add all as White</button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => add(results, "black")}>Add all as Black</button>
            </div>
          </div>
          <table className="data-table">
            <tbody>
              {results.map((r) => (
                <tr key={`${r.eco}-${r.name}`}>
                  <td>
                    {r.name} <span className="hint">{r.eco}</span>
                    <div className="moves-preview">{r.pgn}</div>
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-secondary" disabled={busy} onClick={() => add([r], "white")}>+ White</button>
                    <button className="btn btn-secondary" disabled={busy} onClick={() => add([r], "black")}>+ Black</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ explorer

function replay(ucis) {
  const chess = new Chess();
  const sans = [];
  for (const uci of ucis) {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    sans.push(move.san);
  }
  return { chess, sans };
}

function Explorer({ startMoves, onChanged }) {
  const [moves, setMoves] = useState(startMoves || []);
  const [node, setNode] = useState(null);
  const [orientation, setOrientation] = useState("white");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (startMoves) setMoves(startMoves);
  }, [startMoves]);

  const { chess, sans } = useMemo(() => replay(moves), [moves]);

  useEffect(() => {
    let stale = false;
    api.openingsTree(moves)
      .then((n) => !stale && setNode(n))
      .catch((e) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [moves]);

  function play(from, to) {
    try {
      const move = new Chess(chess.fen()).move({ from, to, promotion: "q" });
      setMoves((m) => [...m, move.from + move.to + (move.promotion || "")]);
      setStatus(null);
      return true;
    } catch {
      return false;
    }
  }

  async function add(color) {
    setBusy(true);
    setError(null);
    try {
      const opening = node?.opening;
      const line = await api.addRepertoireLine({
        color,
        name: opening?.name || "Custom line",
        eco: opening?.eco || null,
        moves_uci: moves,
        source: "explorer",
      });
      setStatus(line.created ? `Added to your ${color} repertoire.` : `You already have this line as ${color}.`);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const opening = node?.opening;
  return (
    <div className="grid-2">
      <div>
        <Board fen={chess.fen()} orientation={orientation} onMove={play} />
        <div className="board-controls">
          <button className="btn btn-secondary" onClick={() => setMoves([])} disabled={!moves.length}>Reset</button>
          <button className="btn btn-secondary" onClick={() => setMoves((m) => m.slice(0, -1))} disabled={!moves.length}>◀ Back</button>
          <button className="btn btn-secondary" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>Flip board</button>
        </div>
      </div>
      <div className="flex-col">
        <div>
          <div className="line-title">{opening ? opening.name : moves.length ? "Custom line" : "Starting position"}</div>
          <div className="moves-preview">{moves.length ? movesText(sans) : "Play a move on the board or pick one below."}</div>
          {opening && <div className="hint">{opening.eco}{node && !node.in_book ? " · you have left the opening book" : ""}</div>}
        </div>
        <div className="flex-row" style={{ flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || moves.length < 1} onClick={() => add("white")}>Add this line as White</button>
          <button className="btn" disabled={busy || moves.length < 2} onClick={() => add("black")}>Add this line as Black</button>
        </div>
        {status && <div className="ok-text" role="status">{status}</div>}
        {error && <div className="error-box">{error}</div>}
        <div>
          <div className="section-title">Book moves from here</div>
          {node && node.children.length === 0 && (
            <div className="hint">No named openings continue from this position. You can still play your own moves on the board.</div>
          )}
          <div className="book-moves">
            {node?.children.map((c) => (
              <button key={c.move} className="book-move" onClick={() => setMoves((m) => [...m, c.move])}>
                <b>{c.san}</b>
                <span className="book-label">{c.label}</span>
                <span className="hint">{plural(c.lines, "line")}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ PGN import

function ImportPgn({ onChanged }) {
  const [pgn, setPgn] = useState("");
  const [color, setColor] = useState("white");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await api.importPgn(color, pgn);
      setStatus(resultText(res, color));
      if (res.errors.length) setError(res.errors.join(" "));
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(e) {
    const file = e.target.files?.[0];
    if (file) setPgn(await file.text());
  }

  return (
    <form onSubmit={submit} className="flex-col">
      <div className="hint">
        Paste a PGN, such as a Lichess study export or a file of your own analysis. Every
        variation becomes its own line, so one study with sidelines turns into a full repertoire.
      </div>
      <textarea
        className="pgn-input"
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        placeholder={"1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bb5 *"}
        aria-label="PGN to import"
      />
      <div className="flex-row" style={{ flexWrap: "wrap" }}>
        <label className="hint">or choose a file <input type="file" accept=".pgn,.txt" onChange={loadFile} /></label>
      </div>
      <div className="flex-row" style={{ flexWrap: "wrap" }}>
        <span className="hint">I play</span>
        <div className="segmented" role="group" aria-label="Colour you play">
          {["white", "black"].map((c) => (
            <button type="button" key={c} className={color === c ? "active" : ""} onClick={() => setColor(c)}>
              {c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn" type="submit" disabled={busy || !pgn.trim()}>Import lines</button>
      </div>
      {status && <div className="ok-text" role="status">{status}</div>}
      {error && <div className="error-box">{error}</div>}
    </form>
  );
}

// ------------------------------------------------------------------

const WAYS = [
  { id: "search", label: "Search openings" },
  { id: "explore", label: "Explore move by move" },
  { id: "pgn", label: "Import PGN" },
];

export default function AddLines({ onChanged, explorerStart }) {
  const [way, setWay] = useState(explorerStart ? "explore" : "search");

  useEffect(() => {
    if (explorerStart) setWay("explore");
  }, [explorerStart]);

  return (
    <div className="panel flex-col">
      <div className="segmented" role="tablist" aria-label="How to add lines">
        {WAYS.map((w) => (
          <button key={w.id} role="tab" aria-selected={way === w.id} className={way === w.id ? "active" : ""} onClick={() => setWay(w.id)}>
            {w.label}
          </button>
        ))}
      </div>
      {way === "search" && <Search onChanged={onChanged} />}
      {way === "explore" && <Explorer startMoves={explorerStart} onChanged={onChanged} />}
      {way === "pgn" && <ImportPgn onChanged={onChanged} />}
    </div>
  );
}
