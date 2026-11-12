import { useState } from "react";
import { api } from "../api.js";
import { loadNumber, plural, shuffle, uciKey } from "./util.js";

const LEARN_BATCH = 5;
const REVIEW_BATCH = 20;
const DRILL_BATCH = 30;

// One-click sets so a first-time visitor has something to train on.
const STARTERS = [
  { label: "Italian Game", color: "white", query: "Italian Game", limit: 8 },
  { label: "London System", color: "white", query: "London System", limit: 6 },
  { label: "Queen's Gambit", color: "white", query: "Queen's Gambit Declined", limit: 8 },
  { label: "Sicilian Najdorf", color: "black", query: "Sicilian Defense: Najdorf", limit: 8 },
  { label: "Caro-Kann", color: "black", query: "Caro-Kann Defense", limit: 8 },
  { label: "King's Indian", color: "black", query: "King's Indian Defense", limit: 8 },
];

/** Lines that share opening moves sit together, so the trainer can skip the overlap. */
const byMoves = (a, b) => (uciKey(a) < uciKey(b) ? -1 : 1);

export function buildQueue(mode, lines, color) {
  const pool = lines.filter((l) => color === "all" || l.color === color);
  if (mode === "learn") {
    return pool.filter((l) => l.stage === "new").sort(byMoves).slice(0, LEARN_BATCH);
  }
  if (mode === "review") {
    return pool
      .filter((l) => l.stage === "due")
      .sort((a, b) => new Date(a.review.due_at) - new Date(b.review.due_at))
      .slice(0, REVIEW_BATCH)
      .sort(byMoves);
  }
  return shuffle(pool.filter((l) => l.stage !== "new")).slice(0, DRILL_BATCH);
}

function ModeCard({ title, count, unit, blurb, action, disabled, onStart, primary }) {
  return (
    <div className={`mode-card ${primary ? "primary" : ""}`}>
      <div className="mode-count">{count}</div>
      <div className="mode-title">{title}</div>
      <div className="hint">{unit}</div>
      <p className="hint">{blurb}</p>
      <button className={primary ? "btn" : "btn btn-secondary"} disabled={disabled} onClick={onStart}>
        {action}
      </button>
    </div>
  );
}

function Bars({ values, labels, title }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="section-title">{title}</div>
      <div className="bars" role="img" aria-label={`${title}: ${values.join(", ")}`}>
        {values.map((v, i) => (
          <div key={i} className="bar-col" title={`${labels[i]}: ${v}`}>
            <div className="bar-value">{v || ""}</div>
            <div className="bar" style={{ height: `${Math.max(3, (56 * v) / max)}px`, opacity: v ? 1 : 0.25 }} />
            <div className="bar-label">{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Dashboard({ lines, stats, onStart, onChanged, onGoTo }) {
  const [color, setColor] = useState("all");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const counts = color === "all"
    ? { new: stats.new, due: stats.due, learned: stats.learning + stats.mastered + stats.due }
    : (() => {
        const c = stats.by_color[color];
        return { new: c.new, due: c.due, learned: c.learning + c.mastered + c.due };
      })();

  async function addStarter(s) {
    setBusy(s.label);
    setError(null);
    try {
      const hits = await api.openingsSearch(s.query, s.limit);
      await api.addOpenings(s.color, hits);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (stats.total_lines === 0) {
    return (
      <div className="panel">
        <div className="line-title">Build your first repertoire</div>
        <p className="hint">
          A repertoire is the set of opening lines you want to know by heart. Pick a starter set
          below, or use <b>Add lines</b> to search 3,800 named openings, explore move by move, or
          import a PGN.
        </p>
        <div className="starter-grid">
          {STARTERS.map((s) => (
            <button key={s.label} className="starter" disabled={busy !== null} onClick={() => addStarter(s)}>
              <b>{s.label}</b>
              <span className="hint">as {s.color} · {s.limit} lines</span>
              {busy === s.label && <span className="spinner" />}
            </button>
          ))}
        </div>
        {error && <div className="error-box mt-1">{error}</div>}
        <button className="btn mt-2" onClick={() => onGoTo("add")}>Add lines myself</button>
      </div>
    );
  }

  const today = new Date();
  const forecastLabels = stats.forecast.map((_, i) =>
    i === 0 ? "Today" : DAY[new Date(today.getFullYear(), today.getMonth(), today.getDate() + i).getDay()]
  );
  const activityLabels = stats.activity.map((a) => DAY[new Date(`${a.date}T12:00:00`).getDay()]);
  const start = (mode) => onStart(mode, buildQueue(mode, lines, color));

  return (
    <div className="flex-col">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="big">{stats.day_streak}</div>
          <div className="label">Day streak{stats.day_streak > 0 && !stats.practiced_today ? " · practice today to keep it" : ""}</div>
        </div>
        <div className="stat-card"><div className="big">{stats.reviews_today}</div><div className="label">Lines today</div></div>
        <div className="stat-card">
          <div className="big">{stats.accuracy_7d === null ? "–" : `${stats.accuracy_7d}%`}</div>
          <div className="label">Clean runs, 7 days</div>
        </div>
        <div className="stat-card">
          <div className="big">{stats.mastered}<span className="of"> / {stats.total_lines}</span></div>
          <div className="label">Lines mastered</div>
        </div>
      </div>

      <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="section-title" style={{ margin: 0 }}>Train</div>
        <div className="segmented" role="group" aria-label="Which colour to train">
          {["all", "white", "black"].map((c) => (
            <button key={c} className={color === c ? "active" : ""} onClick={() => setColor(c)}>
              {c === "all" ? "Both colours" : `As ${c}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mode-grid">
        <ModeCard
          title="Review"
          count={counts.due}
          unit={counts.due === 1 ? "line due" : "lines due"}
          blurb="Play due lines from memory. Each result decides when you see that line again."
          action={counts.due ? `Review ${Math.min(counts.due, REVIEW_BATCH)}` : "Nothing due"}
          disabled={!counts.due}
          primary={counts.due > 0}
          onStart={() => start("review")}
        />
        <ModeCard
          title="Learn"
          count={counts.new}
          unit={counts.new === 1 ? "new line" : "new lines"}
          blurb="Follow the arrows through a new line, then repeat it from memory."
          action={counts.new ? `Learn ${Math.min(counts.new, LEARN_BATCH)}` : "No new lines"}
          disabled={!counts.new}
          primary={!counts.due && counts.new > 0}
          onStart={() => start("learn")}
        />
        <ModeCard
          title="Drill"
          count={loadNumber("chesscoach.bestDrillStreak")}
          unit="best streak"
          blurb="Learned lines in random order. One mistake ends the run. Doesn't change your schedule."
          action={counts.learned ? "Start a run" : "Learn a line first"}
          disabled={!counts.learned}
          onStart={() => start("drill")}
        />
      </div>

      <div className="panel">
        <div className="grid-even">
          <Bars title="Reviews coming up" values={stats.forecast} labels={forecastLabels} />
          <Bars title="Lines practised, last 7 days" values={stats.activity.map((a) => a.count)} labels={activityLabels} />
        </div>
        <div className="hint mt-1">
          {plural(stats.total_lines, "line")} in your repertoire: {stats.new} new, {stats.learning + stats.due} learning, {stats.mastered} mastered.
        </div>
      </div>
    </div>
  );
}
