import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { movesText, plural } from "./util.js";

/** "After 1. e4, Black plays c5" with correct move numbering for the reply. */
function replyText(gap) {
  const n = Math.floor(gap.moves.length / 2) + 1;
  return gap.moves.length % 2 === 0 ? `${n}. ${gap.reply_san}` : `${n}... ${gap.reply_san}`;
}

export default function Coverage({ lines, onChanged, onExplore }) {
  const hasWhite = lines.some((l) => l.color === "white");
  const hasBlack = lines.some((l) => l.color === "black");
  const [color, setColor] = useState(hasWhite || !hasBlack ? "white" : "black");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return api.coverage(color).then(setData).catch((e) => setError(e.message));
  }, [color]);

  useEffect(() => {
    setData(null);
    load();
  }, [load, lines.length]);

  async function addSuggestion(gap, i) {
    setBusy(i);
    try {
      await api.addOpenings(color, [gap.suggestion], "coverage");
      await onChanged();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const opponent = color === "white" ? "Black" : "White";

  return (
    <div className="flex-col">
      <div className="flex-row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <div className="segmented" role="group" aria-label="Repertoire to check">
          {["white", "black"].map((c) => (
            <button key={c} className={color === c ? "active" : ""} onClick={() => setColor(c)}>
              My {c} repertoire
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!data && !error && <div className="hint">Checking your lines against the opening book…</div>}

      {data && data.lines === 0 && (
        <div className="panel hint">You have no lines as {color} yet, so there is nothing to check.</div>
      )}

      {data && data.lines > 0 && (
        <>
          <div className="panel coverage-head">
            <div className="coverage-score">
              <div className="big">{data.score === null ? "–" : `${data.score}%`}</div>
              <div className="label">Coverage</div>
            </div>
            <div>
              <div className="progress tall"><div style={{ width: `${data.score ?? 0}%` }} /></div>
              <p className="hint">
                A gap is a position your lines reach where {opponent} has a known book reply that
                none of your lines answers. Replies that lead to more theory count for more.
                {data.gap_count > 0
                  ? ` You have ${plural(data.gap_count, "gap")}; the biggest come first.`
                  : " No gaps found. Every book reply in your lines has an answer."}
              </p>
            </div>
          </div>

          {data.gaps.map((gap, i) => (
            <div className="panel gap" key={`${gap.moves.join(",")}-${gap.reply}`}>
              <div>
                <div>
                  {gap.moves.length > 0 && <span className="hint">After {movesText(gap.moves_san)}, </span>}
                  <b>{opponent} can play {replyText(gap)}</b>
                </div>
                <div className="hint">
                  {gap.leads_to ? `Leads to the ${gap.leads_to}` : "A book move"} · {plural(gap.weight, "named line")} follow it
                </div>
              </div>
              <div className="row-actions">
                {gap.suggestion && (
                  <button className="btn" disabled={busy !== null} onClick={() => addSuggestion(gap, i)} title={`Adds: ${gap.suggestion.name}`}>
                    {busy === i ? "Adding…" : "Add main line"}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => onExplore([...gap.moves, gap.reply])}>Choose my reply</button>
              </div>
            </div>
          ))}
          {data.gap_count > data.gaps.length && (
            <div className="hint">Showing the {data.gaps.length} biggest of {data.gap_count} gaps.</div>
          )}
        </>
      )}
    </div>
  );
}
