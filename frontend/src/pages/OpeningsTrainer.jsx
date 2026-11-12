import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import AddLines from "../trainer/AddLines.jsx";
import Coverage from "../trainer/Coverage.jsx";
import Dashboard from "../trainer/Dashboard.jsx";
import RepertoireList from "../trainer/RepertoireList.jsx";
import Session from "../trainer/Session.jsx";

const TABS = [
  { id: "train", label: "Train" },
  { id: "repertoire", label: "Repertoire" },
  { id: "add", label: "Add lines" },
  { id: "coverage", label: "Coverage" },
];

export default function OpeningsTrainer() {
  const [tab, setTab] = useState("train");
  const [lines, setLines] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { mode, lines, key }
  const [explorerStart, setExplorerStart] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api.listRepertoire(), api.trainerStats()]);
      setLines(l);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function startSession(mode, queue) {
    if (queue.length) setSession({ mode, lines: queue, key: Date.now() });
  }

  async function endSession() {
    setSession(null);
    await refresh();
  }

  if (error && !lines) {
    return (
      <div className="error-box">
        {error}
        <div className="mt-1"><button className="btn btn-secondary" onClick={refresh}>Try again</button></div>
      </div>
    );
  }
  if (!lines || !stats) return <div className="hint"><span className="spinner" /> Loading your repertoire…</div>;

  if (session) {
    return <Session key={session.key} mode={session.mode} lines={session.lines} allLines={lines} onExit={endSession} />;
  }

  const todo = stats.due + stats.new;
  return (
    <div className="flex-col">
      <div className="tabs" role="tablist" aria-label="Openings trainer sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "train" && todo > 0 && <span className="badge">{todo}</span>}
            {t.id === "repertoire" && <span className="badge quiet">{lines.length}</span>}
          </button>
        ))}
      </div>
      {error && <div className="error-box">{error}</div>}

      {tab === "train" && (
        <Dashboard lines={lines} stats={stats} onStart={startSession} onChanged={refresh} onGoTo={setTab} />
      )}
      {tab === "repertoire" && (
        <RepertoireList lines={lines} onChanged={refresh} onPractice={(group) => startSession("practice", group)} onGoTo={setTab} />
      )}
      {tab === "add" && <AddLines onChanged={refresh} explorerStart={explorerStart} />}
      {tab === "coverage" && (
        <Coverage
          lines={lines}
          onChanged={refresh}
          onExplore={(moves) => {
            setExplorerStart(moves);
            setTab("add");
          }}
        />
      )}
    </div>
  );
}
