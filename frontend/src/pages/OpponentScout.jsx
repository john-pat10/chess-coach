import { useState } from "react";
import { api } from "../api.js";

function ScorePill({ rate }) {
  const pct = Math.round(rate * 100);
  let color = "var(--amber)";
  if (pct >= 60) color = "var(--green)";
  else if (pct <= 35) color = "var(--red)";
  return (
    <span className="score-pill" style={{ background: "rgba(255,255,255,0.06)", color }}>
      {pct}%
    </span>
  );
}

function OpeningTable({ title, rows, onAdd, addLabel }) {
  if (!rows || rows.length === 0) {
    return (
      <div>
        <div className="section-title">{title}</div>
        <div className="hint">Not enough games yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="section-title">{title}</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Opening</th>
            <th>Games</th>
            <th>Score</th>
            {onAdd && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.eco}-${r.name}`}>
              <td>
                <div>{r.name}</div>
                <div className="hint">{r.eco}</div>
              </td>
              <td>{r.games} <span className="hint">({r.wins}W {r.draws}D {r.losses}L)</span></td>
              <td><ScorePill rate={r.score_rate} /></td>
              {onAdd && (
                <td>
                  <button className="btn-secondary btn" onClick={() => onAdd(r)}>
                    {addLabel}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OpponentScout() {
  const [platform, setPlatform] = useState("lichess");
  const [username, setUsername] = useState("");
  const [maxGames, setMaxGames] = useState(100);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addedMsg, setAddedMsg] = useState(null);

  async function handleScout(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const data = await api.scoutOpponent(platform, username.trim(), maxGames);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // If the opponent has White and struggles in `row`'s opening, we'll be
  // facing it as Black -- so the repertoire line we want is a Black line.
  // If the opponent has Black and struggles there, we want it as White.
  async function addToRepertoire(row, myColor) {
    setAddedMsg(null);
    try {
      const line = await api.openingsLine(row.eco, row.name);
      await api.addRepertoireLine({
        color: myColor,
        name: row.name,
        eco: row.eco,
        moves_uci: line.moves.map((m) => m.uci),
        source: "opponent_scout",
        note: `Prep vs ${report.username} (${report.platform}) -- they score ${Math.round(row.score_rate * 100)}% here`,
      });
      setAddedMsg(`Added "${row.name}" to your ${myColor} repertoire.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex-col">
      <div className="panel">
        <div className="section-title">Scout an opponent</div>
        <form onSubmit={handleScout} className="flex-row" style={{ flexWrap: "wrap" }}>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="lichess">Lichess</option>
            <option value="chesscom">Chess.com</option>
          </select>
          <input
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="number"
            min={5}
            max={500}
            value={maxGames}
            onChange={(e) => setMaxGames(Number(e.target.value))}
            style={{ width: "5.5rem" }}
            title="Max games to fetch"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : "Scout"}
          </button>
        </form>
        <div className="hint mt-1">
          Pulls public game history from Lichess or chess.com's own APIs -- no login needed.
        </div>
        {error && <div className="error-box mt-1">{error}</div>}
        {addedMsg && <div className="hint mt-1" style={{ color: "var(--green)" }}>{addedMsg}</div>}
      </div>

      {report && (
        <div className="flex-col mt-2">
          <div className="panel">
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <div>
                <b>{report.username}</b> on {report.platform}
              </div>
              <div className="hint">
                {report.games_analyzed} games analyzed ({report.games_fetched} fetched, {report.games_skipped} skipped)
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="section-title">Recommended prep</div>
            <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <OpeningTable
                title="When they have White -- worst-scoring lines (play these as Black)"
                rows={report.recommendations.when_they_have_white}
                onAdd={(r) => addToRepertoire(r, "black")}
                addLabel="Add as Black"
              />
              <OpeningTable
                title="When they have Black -- worst-scoring lines (play these as White)"
                rows={report.recommendations.when_they_have_black}
                onAdd={(r) => addToRepertoire(r, "white")}
                addLabel="Add as White"
              />
            </div>
          </div>

          <div className="panel">
            <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <OpeningTable title="Most common as White" rows={report.as_white.most_common} />
              <OpeningTable title="Most common as Black" rows={report.as_black.most_common} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
