import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import Board from "../components/Board.jsx";
import { api } from "../api.js";
import { PATTERN_CHECKLISTS } from "../data/punishLessons.js";
import { allLessons, formatLine, inRepertoire, loadProgress, recordResult, stepLabel } from "../lib/punish.js";

const LAST_MOVE = { background: "rgba(255, 214, 79, 0.42)" };
const PIECE_NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/**
 * One lesson, start to finish.
 *  "move" lessons:   intro -> (opponent's mistake animates) -> solve -> done
 *  "decide" lessons: question -> (if sound) solve -> done
 */
function LessonPlayer({ lesson, onFinished, onNext }) {
  const [phase, setPhase] = useState(lesson.type === "decide" ? "question" : "intro");
  const [stepIdx, setStepIdx] = useState(0);
  const [feedback, setFeedback] = useState(null); // {ok, text}
  const [wrong, setWrong] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [decision, setDecision] = useState(null); // true/false once answered
  const [promo, setPromo] = useState(null); // {from, to} awaiting a piece choice
  const [notes, setNotes] = useState([]); // notes about opponent replies so far

  const steps = lesson.steps;
  const step = steps[stepIdx];

  // Opponent's mistake plays itself shortly after the lesson opens.
  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("solve"), 900);
    return () => clearTimeout(t);
  }, [phase]);

  // Opponent replies inside the punishment line play themselves.
  useEffect(() => {
    if (phase !== "solve") return;
    if (stepIdx >= steps.length) {
      setPhase("done");
      return;
    }
    if (step.byUser) return;
    const t = setTimeout(() => {
      if (step.note) setNotes((n) => [...n, { label: stepLabel(step), text: step.note }]);
      setStepIdx((i) => i + 1);
    }, 650);
    return () => clearTimeout(t);
  }, [phase, stepIdx, step, steps.length]);

  // Save the result once, when the lesson is finished.
  const clean = wrong === 0 && !revealed && (lesson.type !== "decide" || decision === lesson.answer);
  useEffect(() => {
    if (phase === "done") onFinished(lesson.id, clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  let fen;
  let lastMove = null;
  if (phase === "intro" || phase === "question" || (lesson.type === "decide" && phase === "done" && !lesson.answer)) {
    fen = lesson.startFen;
  } else if (stepIdx === 0) {
    fen = lesson.mistake ? lesson.mistake.fenAfter : lesson.startFen;
    lastMove = lesson.mistake;
  } else {
    fen = steps[stepIdx - 1].fenAfter;
    lastMove = steps[stepIdx - 1];
  }
  const userTurn = phase === "solve" && step && step.byUser;

  const squareStyles = {};
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE;
    squareStyles[lastMove.to] = LAST_MOVE;
  }
  if (userTurn && hinted && !revealed) {
    squareStyles[step.from] = { background: "rgba(79, 163, 227, 0.5)" };
  }
  const arrows = [];
  if (userTurn && revealed) {
    arrows.push({ startSquare: step.from, endSquare: step.to, color: "rgba(21, 120, 27, 0.8)" });
  }
  if (phase === "done" && lesson.type === "decide" && !lesson.answer && lesson.better) {
    arrows.push({ startSquare: lesson.better.from, endSquare: lesson.better.to, color: "rgba(21, 120, 27, 0.8)" });
  }

  function attempt(from, to, promotion) {
    const matches = (m) => m.from === from && m.to === to && (m.promotion ?? null) === (promotion ?? null);
    if (matches(step)) {
      setFeedback({ ok: true, text: `${stepLabel(step)} -- that's it!` });
      setRevealed(false);
      setHinted(false);
      setStepIdx((i) => i + 1);
      return true;
    }
    const alt = step.alts.find(matches);
    if (alt) {
      setFeedback({
        ok: true,
        text: `${alt.san} works just as well (the engine rates it equally). The lesson follows ${stepLabel(step)}.`,
      });
      setRevealed(false);
      setHinted(false);
      setStepIdx((i) => i + 1);
      return false; // board snaps to the lesson move
    }
    setWrong((w) => w + 1);
    setFeedback({ ok: false, text: "That's not the punishment -- look again." });
    return false;
  }

  function handleDrop({ sourceSquare, targetSquare }) {
    if (!userTurn || !targetSquare) return false;
    const probe = new Chess(fen);
    const legal = probe.moves({ square: sourceSquare, verbose: true }).filter((m) => m.to === targetSquare);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion)) {
      setPromo({ from: sourceSquare, to: targetSquare });
      return false;
    }
    return attempt(sourceSquare, targetSquare, null);
  }

  function answer(yes) {
    setDecision(yes);
    const right = yes === lesson.answer;
    setFeedback({
      ok: right,
      text: right
        ? yes
          ? "Correct -- the sacrifice works. Now play the attack."
          : "Correct -- the sacrifice doesn't work here."
        : yes
          ? "Not here -- the sacrifice fails in this position."
          : "Actually it works here! Play through the attack.",
    });
    setPhase(lesson.answer ? "solve" : "done");
  }

  function restart() {
    setPhase(lesson.type === "decide" ? "question" : "intro");
    setStepIdx(0);
    setFeedback(null);
    setWrong(0);
    setRevealed(false);
    setHinted(false);
    setDecision(null);
    setPromo(null);
    setNotes([]);
  }

  const youAre = lesson.side === "white" ? "White" : "Black";
  const pieceToMove = step ? PIECE_NAMES[new Chess(step.fenBefore).get(step.from)?.type] : null;

  return (
    <div className="grid-2">
      <div>
        <Board
          id={`punish-${lesson.id}`}
          fen={fen}
          orientation={lesson.side}
          onPieceDrop={handleDrop}
          allowDragging={!!userTurn && !promo}
          squareStyles={squareStyles}
          arrows={arrows}
        />
        {promo && (
          <div className="flex-row mt-1" style={{ justifyContent: "center" }}>
            <span className="hint">Promote to:</span>
            {["q", "r", "b", "n"].map((p) => (
              <button
                key={p}
                className="btn-secondary btn btn-sm"
                onClick={() => {
                  const { from, to } = promo;
                  setPromo(null);
                  attempt(from, to, p);
                }}
              >
                {PIECE_NAMES[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-col">
        <div className="panel">
          <div className="section-title">{lesson.family}</div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{lesson.title}</div>
          <div className="hint">
            {lesson.opening} · you are {youAre}
          </div>

          {lesson.type === "move" && phase === "intro" && (
            <div className="commentary-box mt-1">Watch your opponent's move...</div>
          )}

          {lesson.type === "move" && phase !== "intro" && (
            <div className="commentary-box mt-1">
              Your opponent played <b>{stepLabel({ ...lesson.mistake, ...moveMeta(lesson.startFen) })}</b>.{" "}
              <span className="hint" style={{ fontSize: "inherit" }}>
                Why it's tempting: {lesson.why}
              </span>
            </div>
          )}

          {lesson.type === "decide" && (
            <div className="commentary-box mt-1">{lesson.question}</div>
          )}
          {lesson.type === "decide" && phase === "question" && (
            <div className="flex-row mt-1">
              <button className="btn" onClick={() => answer(true)}>Yes, sacrifice</button>
              <button className="btn-secondary btn" onClick={() => answer(false)}>No, it doesn't work</button>
            </div>
          )}
          {lesson.type === "decide" && phase === "question" && PATTERN_CHECKLISTS.greekGift && (
            <details className="mt-1">
              <summary className="hint" style={{ cursor: "pointer" }}>Greek gift checklist</summary>
              <ul className="hint" style={{ margin: "0.4rem 0 0 1rem", padding: 0 }}>
                {PATTERN_CHECKLISTS.greekGift.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
          )}

          {feedback && (
            <div
              className="commentary-box mt-1"
              style={{ borderColor: feedback.ok ? "var(--green)" : "var(--red)" }}
            >
              {feedback.text}
            </div>
          )}

          {notes.map((n) => (
            <div key={n.label} className="hint mt-1">
              <b>{n.label}?</b> {n.text}
            </div>
          ))}

          {userTurn && (
            <div className="mt-1 flex-col">
              <div className="hint">
                {stepIdx === 0 ? "How do you punish it? " : "Keep going. "}
                Drag a piece on the board.
              </div>
              <div className="flex-row">
                {!hinted && !revealed && (
                  <button className="btn-secondary btn btn-sm" onClick={() => { setHinted(true); setWrong((w) => w + 1); }}>
                    Hint
                  </button>
                )}
                {hinted && !revealed && <span className="hint">Move your {pieceToMove} (highlighted).</span>}
                {!revealed && (
                  <button className="btn-secondary btn btn-sm" onClick={() => setRevealed(true)}>
                    Show the move
                  </button>
                )}
                {revealed && <span className="hint">Play <b>{step.san}</b> (shown by the arrow).</span>}
              </div>
            </div>
          )}

          {phase === "solve" && step && !step.byUser && (
            <div className="hint mt-1">Opponent is replying...</div>
          )}
        </div>

        {phase === "done" && (
          <div className="panel">
            <div className="section-title">What happened</div>
            {steps.length > 0 && (
              <div className="hint" style={{ marginBottom: 6 }}>
                {formatLine(
                  lesson.mistake ? [{ ...lesson.mistake, ...moveMeta(lesson.startFen), san: `${lesson.mistake.san}?` }, ...steps] : steps
                )}
              </div>
            )}
            {lesson.type === "decide" && !lesson.answer && lesson.better && (
              <div className="hint" style={{ marginBottom: 6 }}>
                Better plan: <b>{lesson.better.san}</b> (green arrow).
              </div>
            )}
            <div>{lesson.explain}</div>
            <div className="commentary-box mt-1" style={{ borderColor: "var(--accent)" }}>
              <b>Pattern to remember:</b> {lesson.takeaway}
            </div>
            <div className="hint mt-1">Result: {lesson.result}</div>
            <div className="flex-row mt-1">
              <button className="btn-secondary btn" onClick={restart}>Try again</button>
              <button className="btn" onClick={onNext}>Next lesson</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Move number / side to move of a FEN, for labelling the opponent's mistake.
function moveMeta(fen) {
  const parts = fen.split(" ");
  return { white: parts[1] === "w", moveNumber: Number(parts[5]) };
}

export default function PunishMistakes() {
  const lessons = useMemo(() => allLessons(), []);
  const [repertoire, setRepertoire] = useState([]);
  const [progress, setProgress] = useState(() => loadProgress());
  const [sideFilter, setSideFilter] = useState("all");
  const [onlyRep, setOnlyRep] = useState(false);
  const [currentId, setCurrentId] = useState(lessons[0].id);

  useEffect(() => {
    api.listRepertoire().then(setRepertoire).catch(() => setRepertoire([]));
  }, []);

  const repIds = useMemo(
    () => new Set(lessons.filter((l) => inRepertoire(l, repertoire)).map((l) => l.id)),
    [lessons, repertoire]
  );

  const visible = lessons.filter(
    (l) => (sideFilter === "all" || l.side === sideFilter) && (!onlyRep || repIds.has(l.id))
  );
  const groups = [];
  for (const l of visible) {
    let g = groups.find((x) => x.family === l.family);
    if (!g) groups.push((g = { family: l.family, items: [] }));
    g.items.push(l);
  }

  const current = lessons.find((l) => l.id === currentId) ?? lessons[0];
  const solvedCount = lessons.filter((l) => progress[l.id]?.clean > 0).length;

  function next() {
    const list = visible.length ? visible : lessons;
    const i = list.findIndex((l) => l.id === current.id);
    // Prefer the next lesson you haven't solved cleanly yet.
    for (let k = 1; k <= list.length; k++) {
      const cand = list[(i + k) % list.length];
      if (!(progress[cand.id]?.clean > 0)) return setCurrentId(cand.id);
    }
    setCurrentId(list[(i + 1) % list.length].id);
  }

  return (
    <div className="flex-col">
      <LessonPlayer
        key={current.id}
        lesson={current}
        onFinished={(id, clean) => setProgress(recordResult(id, clean))}
        onNext={next}
      />

      <div className="panel mt-1">
        <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="section-title" style={{ margin: 0 }}>
            Punish the mistake · {solvedCount}/{lessons.length} solved
          </div>
          <div className="flex-row" style={{ flexWrap: "wrap" }}>
            <select value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}>
              <option value="all">Both colours</option>
              <option value="white">Playing White</option>
              <option value="black">Playing Black</option>
            </select>
            <label className="flex-row hint" style={{ cursor: repIds.size ? "pointer" : "default" }}>
              <input
                type="checkbox"
                checked={onlyRep}
                disabled={!repIds.size}
                onChange={(e) => setOnlyRep(e.target.checked)}
              />
              Only my repertoire ({repIds.size})
            </label>
          </div>
        </div>
        <div className="hint mt-1">
          Natural-looking moves opponents really play in each opening, and exactly how to punish them. Every
          line is checked with Stockfish. Lessons marked "rep" come up in your Openings Trainer repertoire.
        </div>
        {groups.length === 0 && <div className="hint mt-1">No lessons match these filters.</div>}
        <div className="punish-groups mt-1">
          {groups.map((g) => (
            <div key={g.family} className="punish-group">
              <div className="punish-family">{g.family}</div>
              {g.items.map((l) => {
                const p = progress[l.id];
                return (
                  <button
                    key={l.id}
                    className={`punish-item ${l.id === current.id ? "active" : ""}`}
                    onClick={() => {
                      setCurrentId(l.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="punish-status">{p?.clean > 0 ? "✓" : p ? "•" : ""}</span>
                    <span className="punish-title">{l.title}</span>
                    <span className="punish-meta">
                      {l.side === "white" ? "W" : "B"}
                      {repIds.has(l.id) ? " · rep" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
