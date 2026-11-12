import { useMemo, useState } from "react";
import { api } from "../api.js";
import { STAGES, familyOf, formatDue, movesText, plural, uciKey, variationOf } from "./util.js";

function StageChip({ stage }) {
  return <span className={`chip chip-${stage}`} title={STAGES[stage].hint}>{STAGES[stage].label}</span>;
}

function LineRow({ line, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(line.note || "");

  async function saveNote(e) {
    e.preventDefault();
    try {
      await api.updateRepertoireLine(line.id, { note });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function remove() {
    try {
      await api.deleteRepertoireLine(line.id);
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <tr>
      <td>
        <div>{variationOf(line.name)} {line.eco && <span className="hint">{line.eco}</span>}</div>
        <div className="moves-preview">{movesText(line.moves.map((m) => m.san))}</div>
        {editing ? (
          <form onSubmit={saveNote} className="flex-row mt-1">
            <input
              autoFocus
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A reminder shown while you train this line"
              style={{ flex: 1 }}
            />
            <button className="btn" type="submit">Save</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          line.note && <div className="hint">Note: {line.note}</div>
        )}
      </td>
      <td><StageChip stage={line.stage} /></td>
      <td className="hint">
        {line.stage === "new" ? "–" : formatDue(line.review.due_at)}
        {line.review.lapses > 0 && <div>{plural(line.review.lapses, "lapse")}</div>}
      </td>
      <td className="row-actions">
        {!editing && (
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>{line.note ? "Edit note" : "Add note"}</button>
        )}
        <button className="btn btn-danger" onClick={remove} aria-label={`Remove ${line.name}`}>Remove</button>
      </td>
    </tr>
  );
}

export default function RepertoireList({ lines, onChanged, onPractice, onGoTo }) {
  const [color, setColor] = useState("all");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [error, setError] = useState(null);

  const groups = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map();
    for (const l of lines) {
      if (color !== "all" && l.color !== color) continue;
      const haystack = `${l.name} ${l.eco || ""} ${l.note || ""}`.toLowerCase();
      if (!words.every((w) => haystack.includes(w))) continue;
      const key = `${l.color}|${familyOf(l.name)}`;
      if (!map.has(key)) map.set(key, { key, color: l.color, family: familyOf(l.name), lines: [] });
      map.get(key).lines.push(l);
    }
    const out = [...map.values()];
    for (const g of out) g.lines.sort((a, b) => (uciKey(a) < uciKey(b) ? -1 : 1));
    return out.sort((a, b) => a.color.localeCompare(b.color) * -1 || a.family.localeCompare(b.family));
  }, [lines, color, filter]);

  function toggle(key) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function removeGroup(group) {
    if (!window.confirm(`Remove all ${plural(group.lines.length, "line")} of ${group.family} (${group.color}) and their progress?`)) return;
    try {
      await api.deleteRepertoireLines(group.lines.map((l) => l.id));
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="panel">
        <div className="hint">Your repertoire is empty.</div>
        <button className="btn mt-1" onClick={() => onGoTo("add")}>Add lines</button>
      </div>
    );
  }

  const shownCount = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <div className="flex-col">
      <div className="flex-row" style={{ flexWrap: "wrap" }}>
        <div className="segmented" role="group" aria-label="Filter by colour">
          {["all", "white", "black"].map((c) => (
            <button key={c} className={color === c ? "active" : ""} onClick={() => setColor(c)}>
              {c === "all" ? "Both" : c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <input
          placeholder="Filter by name, ECO code or note"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, minWidth: "12rem" }}
          aria-label="Filter lines"
        />
        <span className="hint">{shownCount} of {plural(lines.length, "line")}</span>
      </div>
      {error && <div className="error-box">{error}</div>}
      {groups.length === 0 && <div className="hint">No lines match that filter.</div>}

      {groups.map((g) => {
        const count = (stage) => g.lines.filter((l) => l.stage === stage).length;
        const isOpen = open.has(g.key);
        return (
          <div className="panel group" key={g.key}>
            <div className="group-head">
              <button className="group-toggle" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
                <span className="caret">{isOpen ? "▾" : "▸"}</span>
                <span className={`side side-${g.color}`} title={`You play ${g.color}`} />
                <span className="group-name">{g.family}</span>
                <span className="hint">{plural(g.lines.length, "line")}</span>
              </button>
              <div className="group-chips">
                {["due", "new", "learning", "mastered"].map((s) =>
                  count(s) ? <span key={s} className={`chip chip-${s}`}>{count(s)} {STAGES[s].label.toLowerCase()}</span> : null
                )}
              </div>
              <div className="row-actions">
                <button className="btn btn-secondary" onClick={() => onPractice(g.lines)}>Practise</button>
                <button className="btn btn-danger" onClick={() => removeGroup(g)}>Remove all</button>
              </div>
            </div>
            {isOpen && (
              <table className="data-table mt-1">
                <thead>
                  <tr><th>Line</th><th>Stage</th><th>Next review</th><th></th></tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => <LineRow key={l.id} line={l} onChanged={onChanged} onError={setError} />)}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
