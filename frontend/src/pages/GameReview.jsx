import { Fragment, useEffect, useMemo, useState } from "react";
import Board from "../components/Board.jsx";
import EvalBar from "../components/EvalBar.jsx";
import { api } from "../api.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SAMPLE_PGN = `[Event "Casual game"]
[White "You"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

export default function GameReview() {
  const [pgnText, setPgnText] = useState(SAMPLE_PGN);
  const [result, setResult] = useState(null);
  const [ply, setPly] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleAnalyze(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.analyze(pgnText);
      setResult(data);
      setPly(0);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const maxPly = result ? result.moves.length : 0;

  useEffect(() => {
    function onKey(e) {
      if (!result) return;
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPly((p) => Math.min(maxPly, p + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, maxPly]);

  const fen = result ? (ply === 0 ? START_FEN : result.moves[ply - 1].fen_after) : START_FEN;
  const cp = result ? result.eval_graph_white_cp[ply] : 0;
  const currentMove = result && ply > 0 ? result.moves[ply - 1] : null;

  const rows = useMemo(() => {
    if (!result) return [];
    const byNumber = {};
    for (const m of result.moves) {
      byNumber[m.move_number] ??= { number: m.move_number };
      byNumber[m.move_number][m.color] = m;
    }
    return Object.values(byNumber);
  }, [result]);

  function MoveCell({ move, plyIndex }) {
    if (!move) return <div className="move-cell" />;
    return (
      <div
        className={`move-cell ${ply === plyIndex ? "active" : ""}`}
        onClick={() => setPly(plyIndex)}
      >
        <span>{move.san}</span>
        {move.classification !== "Good" && (
          <span className={`tag tag-${move.classification}`}>{move.classification}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex-col">
      <div className="panel">
        <div className="section-title">Paste a PGN to review</div>
        <form onSubmit={handleAnalyze} className="flex-col">
          <textarea
            className="pgn-input"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder="Paste PGN here..."
          />
          <div className="flex-row">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "Analyze game"}
            </button>
            <span className="hint">
              Runs Stockfish locally -- a full game usually takes a few seconds to a minute.
            </span>
          </div>
        </form>
        {error && <div className="error-box mt-1">{error}</div>}
      </div>

      {result && (
        <div className="grid-2 mt-2">
          <div>
            <div className="flex-row" style={{ alignItems: "flex-start" }}>
              <EvalBar cp={cp} />
              <Board fen={fen} />
            </div>
            <div className="board-controls">
              <button className="btn-secondary btn" onClick={() => setPly(0)}>|◀</button>
              <button className="btn-secondary btn" onClick={() => setPly((p) => Math.max(0, p - 1))}>◀</button>
              <button className="btn-secondary btn" onClick={() => setPly((p) => Math.min(maxPly, p + 1))}>▶</button>
              <button className="btn-secondary btn" onClick={() => setPly(maxPly)}>▶|</button>
            </div>

            <div className="panel mt-2">
              <div className="section-title">
                {result.opening ? `${result.opening.eco} · ${result.opening.name}` : "Opening: unclassified"}
              </div>
              <div className="commentary-box">
                {currentMove
                  ? currentMove.comment
                  : "Starting position. Step through the game with the arrows or click a move."}
              </div>
              {currentMove?.alternative_lines?.length > 0 && (
                <div className="mt-1">
                  <div className="section-title">Lines to consider instead</div>
                  <div className="flex-col">
                    {currentMove.alternative_lines.map((l, i) => (
                      <div key={i} className="hint">
                        <b style={{ color: "var(--text)" }}>{l.eval_str}</b> &nbsp; {l.line_san}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-col">
            <div className="panel">
              <div className="section-title">Game summary</div>
              <div className="summary-cards">
                {["White", "Black"].map((side) => (
                  <div className="stat-card" key={side}>
                    <div className="label">{side} accuracy</div>
                    <div className="big">{result.summary[side].accuracy}%</div>
                    <div className="hint">
                      {result.summary[side].blunders} blunders · {result.summary[side].mistakes} mistakes ·{" "}
                      {result.summary[side].inaccuracies} inaccuracies
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel mt-2">
              <div className="section-title">Moves</div>
              <div className="move-list">
                {rows.map((row) => (
                  <Fragment key={row.number}>
                    <div className="num">{row.number}.</div>
                    <MoveCell move={row.White} plyIndex={row.White ? row.White.ply : -1} />
                    <MoveCell move={row.Black} plyIndex={row.Black ? row.Black.ply : -1} />
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
