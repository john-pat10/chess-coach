import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Board from "../components/Board.jsx";
import { api } from "../api.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function formatDue(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d - now;
  if (diffMs <= 0) return "due now";
  const days = Math.round(diffMs / 86400000);
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

function PracticePanel({ onRepertoireChanged }) {
  const [dueLine, setDueLine] = useState(undefined); // undefined = loading, null = none due
  const [ply, setPly] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [hadMistake, setHadMistake] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [summary, setSummary] = useState(null);

  const loadNext = useCallback(async () => {
    const [line, sum] = await Promise.all([api.trainerNext(), api.trainerSummary()]);
    setDueLine(line);
    setSummary(sum);
    setPly(0);
    setFeedback(null);
    setHadMistake(false);
    setRevealed(false);
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const total = dueLine?.moves?.length ?? 0;
  const userIsWhite = dueLine?.color === "white";
  const userTurn = dueLine && ply < total && ((ply % 2 === 0) === userIsWhite);

  // Auto-play the opponent's half of the line.
  useEffect(() => {
    if (!dueLine || ply >= total) return;
    if (userTurn) return;
    const t = setTimeout(() => setPly((p) => p + 1), 500);
    return () => clearTimeout(t);
  }, [dueLine, ply, total, userTurn]);

  if (dueLine === undefined) {
    return <div className="hint">Loading...</div>;
  }

  if (dueLine === null) {
    return (
      <div className="flex-col">
        <div className="hint">
          Nothing due for review right now
          {summary ? ` (${summary.total_lines} lines in your repertoire).` : "."}
        </div>
        {summary && summary.total_lines === 0 && (
          <div className="hint">Add some openings below to start building a repertoire.</div>
        )}
      </div>
    );
  }

  const fen = ply === 0 ? START_FEN : dueLine.moves[ply - 1].fen_after;
  const expected = ply < total ? dueLine.moves[ply] : null;
  const lineDone = ply >= total;

  function handleDrop({ sourceSquare, targetSquare }) {
    if (!userTurn || !expected) return false;
    if (sourceSquare === expected.from && targetSquare === expected.to) {
      setFeedback({ ok: true, text: `${expected.san} -- correct!` });
      setRevealed(false);
      setPly((p) => p + 1);
      return true;
    }
    setHadMistake(true);
    setFeedback({ ok: false, text: "Not quite -- try again." });
    return false;
  }

  async function grade(result) {
    await api.trainerAttempt(dueLine.id, result);
    onRepertoireChanged?.();
    await loadNext();
  }

  return (
    <div className="grid-2">
      <div>
        <Board
          fen={fen}
          orientation={userIsWhite ? "white" : "black"}
          onPieceDrop={handleDrop}
          allowDragging={userTurn && !lineDone}
        />
      </div>
      <div className="flex-col">
        <div className="panel">
          <div className="section-title">
            {dueLine.eco ? `${dueLine.eco} · ` : ""}
            {dueLine.name}
          </div>
          <div className="hint">
            You're drilling this as {dueLine.color}. {formatDue(dueLine.review.due_at)} normally --
            practicing it now.
          </div>
          {feedback && (
            <div className="commentary-box mt-1" style={{ borderColor: feedback.ok ? "var(--green)" : "var(--red)" }}>
              {feedback.text}
            </div>
          )}
          {!lineDone && !feedback && (
            <div className="commentary-box mt-1">
              {userTurn ? "Your move -- drag a piece on the board." : "Playing the opponent's move..."}
            </div>
          )}
          {!lineDone && userTurn && (
            <div className="mt-1">
              {!revealed ? (
                <button className="btn-secondary btn" onClick={() => setRevealed(true)}>
                  Show the move
                </button>
              ) : (
                <div className="hint">The book move is <b>{expected.san}</b>.</div>
              )}
            </div>
          )}
          {lineDone && (
            <div className="mt-2 flex-col">
              <div className="hint">How did that go?</div>
              <div className="flex-row">
                <button className="btn-secondary btn" onClick={() => grade("again")}>Again</button>
                <button className="btn-secondary btn" onClick={() => grade("hard")}>Hard</button>
                <button className="btn" onClick={() => grade("good")}>Good</button>
                <button className="btn" onClick={() => grade("easy")}>Easy</button>
              </div>
              {hadMistake && <div className="hint">You missed a move here -- "Again" or "Hard" will bring it back sooner.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RepertoireManager({ refreshKey, onChanged }) {
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    api.listRepertoire().then(setLines).catch((e) => setError(e.message));
  }, [refreshKey]);

  async function search(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setStatusMsg(null);
    try {
      setResults(await api.openingsSearch(query.trim(), 300));
    } catch (e) {
      setError(e.message);
    }
  }

  async function addOpening(eco, name, color) {
    setBusy(true);
    setError(null);
    try {
      const line = await api.openingsLine(eco, name);
      await api.addRepertoireLine({
        color,
        name,
        eco,
        moves_uci: line.moves.map((m) => m.uci),
        source: "manual",
      });
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Add every currently-listed search result as one color -- this is how you
  // turn "Sicilian Dragon" into 30+ separate drillable variations in one go,
  // instead of clicking "+ White" forty times.
  async function addMany(rows, color) {
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    setProgress({ done: 0, total: rows.length });
    let added = 0;
    let skipped = 0;
    for (const r of rows) {
      const alreadyHave = lines.some((l) => l.eco === r.eco && l.name === r.name && l.color === color);
      if (alreadyHave) {
        skipped += 1;
      } else {
        try {
          const line = await api.openingsLine(r.eco, r.name);
          await api.addRepertoireLine({
            color,
            name: r.name,
            eco: r.eco,
            moves_uci: line.moves.map((m) => m.uci),
            source: "manual",
          });
          added += 1;
        } catch (e) {
          setError(e.message);
        }
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    setBusy(false);
    setStatusMsg(
      `Added ${added} line${added === 1 ? "" : "s"} as ${color}` +
        (skipped ? ` (skipped ${skipped} already in your repertoire).` : ".")
    );
    onChanged();
  }

  function downloadBackup() {
    const blob = new Blob([api.exportRepertoire()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chesscoach-repertoire.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restoreBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const added = await api.importRepertoire(await file.text());
      setStatusMsg(`Restored ${added} line${added === 1 ? "" : "s"} from the backup.`);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLine(id) {
    await api.deleteRepertoireLine(id);
    onChanged();
  }

  return (
    <div className="flex-col">
      <div className="panel">
        <div className="section-title">Add an opening to drill</div>
        <form onSubmit={search} className="flex-row">
          <input
            placeholder="Search by name, ECO code or moves, e.g. 'queens gambit', 'B33', '1. e4 c5'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="hint mt-1">
          Search by name (typos and word order are fine, and shorthand like QGD or KID works), by
          ECO code like "B33", or by moves like "1. e4 c5 2. Nf3". Use "Add all" to drop every
          result into your repertoire at once. Openings come from the Lichess opening database.
        </div>
        {results.length > 0 && (
          <div className="flex-row mt-1" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="hint">{results.length} matching line{results.length === 1 ? "" : "s"}</div>
            <div className="flex-row">
              <button className="btn-secondary btn" disabled={busy} onClick={() => addMany(results, "white")}>
                Add all {results.length} as White
              </button>
              <button className="btn-secondary btn" disabled={busy} onClick={() => addMany(results, "black")}>
                Add all {results.length} as Black
              </button>
            </div>
          </div>
        )}
        {progress && (
          <div className="hint mt-1">Adding {progress.done}/{progress.total}...</div>
        )}
        {statusMsg && <div className="hint mt-1" style={{ color: "var(--green)" }}>{statusMsg}</div>}
        {results.length > 0 && (
          <table className="data-table mt-1">
            <tbody>
              {results.map((r) => (
                <tr key={`${r.eco}-${r.name}`}>
                  <td>
                    {r.name} <span className="hint">{r.eco}</span>
                    {r.moves && <div className="hint" style={{ fontSize: "0.82rem" }}>{r.moves}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-secondary btn" disabled={busy} onClick={() => addOpening(r.eco, r.name, "white")}>
                      + White
                    </button>{" "}
                    <button className="btn-secondary btn" disabled={busy} onClick={() => addOpening(r.eco, r.name, "black")}>
                      + Black
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {error && <div className="error-box mt-1">{error}</div>}
      </div>

      <div className="panel mt-2">
        <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="section-title">Your repertoire ({lines.length})</div>
          <div className="flex-row">
            <button className="btn-secondary btn" onClick={downloadBackup} disabled={!lines.length}>
              Download backup
            </button>
            <label className="btn-secondary btn" style={{ cursor: "pointer" }}>
              Restore backup
              <input type="file" accept="application/json,.json" onChange={restoreBackup} hidden />
            </label>
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>
          Your repertoire is saved in this browser. Download a backup to move it to another device.
        </div>
        {lines.length === 0 ? (
          <div className="hint">Nothing yet -- search above, or add lines from the Opponent Scout page.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Opening</th>
                <th>Color</th>
                <th>Schedule</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.name} <span className="hint">{l.eco}</span>
                    {l.note && <div className="hint">{l.note}</div>}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{l.color}</td>
                  <td className="hint">
                    {l.review.is_due ? "due now" : formatDue(l.review.due_at)} · rep {l.review.repetitions}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-danger btn" onClick={() => removeLine(l.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function OpeningsTrainer() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="flex-col">
      <div className="panel">
        <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="section-title">Practice</div>
          <Link to="/punish" className="hint">
            Know the moves? Learn how to punish your opponents' mistakes in these openings →
          </Link>
        </div>
        <PracticePanel key={refreshKey} onRepertoireChanged={bump} />
      </div>
      <div className="mt-2">
        <RepertoireManager refreshKey={refreshKey} onChanged={bump} />
      </div>
    </div>
  );
}
