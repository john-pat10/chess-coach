import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "../components/Board.jsx";
import { api } from "../api.js";
import { START_FEN, commonPrefix, formatDue, loadNumber, plural, saveNumber, uciKey } from "./util.js";

const GUIDE_ARROW = "rgba(110, 163, 91, 0.9)";
const HINT_ARROW = "rgba(208, 167, 90, 0.95)";
const LAST_MOVE = { background: "rgba(208, 167, 90, 0.28)" };
const HINT_SQUARE = { background: "rgba(208, 167, 90, 0.6)" };
const WRONG_SQUARE = { background: "rgba(208, 90, 90, 0.65)" };
const BEST_STREAK_KEY = "chesscoach.bestDrillStreak";

const MODE_TITLES = { learn: "Learn", review: "Review", drill: "Drill", practice: "Practice" };
const GRADE_TEXT = {
  good: "Clean — no mistakes.",
  easy: "Clean — no mistakes.",
  hard: "One slip. It will come back a little sooner.",
  again: "Needs more work. It will come back shortly.",
};

/** Is from->to a legal chess move here? (A fumbled drop shouldn't count as a mistake.) */
function isLegal(fen, from, to) {
  try {
    new Chess(fen).move({ from, to, promotion: "q" });
    return true;
  } catch {
    return false;
  }
}

/**
 * One training session over a list of lines.
 *
 * mode:
 *   learn    -- each line twice: once following arrows, then from memory
 *   review   -- from memory; the result reschedules the line (spaced repetition)
 *   drill    -- from memory, random order; the session ends at the first mistake
 *   practice -- from memory, no pressure and no effect on the schedule
 */
export default function Session({ mode, lines, allLines, onExit }) {
  const [queue, setQueue] = useState(lines);
  const [index, setIndex] = useState(0);
  const [pass, setPass] = useState(mode === "learn" ? "guided" : "recall");
  const [ply, setPly] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(0);
  const [wrongHere, setWrongHere] = useState(0); // wrong tries on the current move
  const [hintLevel, setHintLevel] = useState(0); // 0 none, 1 square, 2 arrow
  const [wrongSquare, setWrongSquare] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [outcome, setOutcome] = useState(null); // set when the current line is finished
  const [saveError, setSaveError] = useState(null);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);
  const [recallTries, setRecallTries] = useState(0);
  const requeued = useRef(new Set());
  const submitting = useRef(false);

  const line = queue[index];
  const total = line.moves.length;
  const userIsWhite = line.color === "white";
  const lineOver = ply >= total;
  const userTurn = !lineOver && (ply % 2 === 0) === userIsWhite;
  const expected = lineOver ? null : line.moves[ply];
  const fen = ply === 0 ? START_FEN : line.moves[ply - 1].fen_after;
  const guided = pass === "guided";
  const serverMode = mode === "practice" ? "drill" : mode;

  // Every (position, move) the repertoire plays for this colour, so a move
  // that belongs to a *different* line of yours isn't punished as a mistake.
  const knownMoves = useMemo(() => {
    const set = new Set();
    for (const l of allLines) {
      if (l.color !== line.color) continue;
      let prefix = "";
      for (const m of l.moves) {
        set.add(`${prefix}>${m.uci.slice(0, 4)}`);
        prefix += m.uci + ",";
      }
    }
    return set;
  }, [allLines, line.color]);

  const startLine = useCallback((nextIndex, nextQueue, nextPass) => {
    const next = nextQueue[nextIndex];
    let start = 0;
    // Skip the moves this line shares with the one just played -- but only
    // when recalling, and always leave at least one of your own moves to find.
    if (nextPass === "recall" && nextIndex > 0 && mode !== "learn") {
      const shared = commonPrefix(next, nextQueue[nextIndex - 1]);
      const white = next.color === "white";
      let lastUserPly = next.moves.length - 1;
      if ((lastUserPly % 2 === 0) !== white) lastUserPly -= 1;
      start = Math.max(0, Math.min(shared, lastUserPly));
    }
    setIndex(nextIndex);
    setPass(nextPass);
    setPly(start);
    setSkipped(start);
    setMistakes(0);
    setHints(0);
    setWrongHere(0);
    setHintLevel(0);
    setWrongSquare(null);
    setFeedback(null);
    setOutcome(null);
    setSaveError(null);
    setRecallTries(0);
    submitting.current = false;
  }, [mode]);

  // The opponent's moves play themselves.
  useEffect(() => {
    if (lineOver || userTurn || outcome) return;
    const t = setTimeout(() => setPly((p) => p + 1), ply < skipped ? 0 : 450);
    return () => clearTimeout(t);
  }, [lineOver, userTurn, outcome, ply, skipped]);

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSaveError(null);
    try {
      const res = await api.trainerAttempt(line.id, { mode: serverMode, mistakes, hints });
      const clean = mistakes + hints === 0;
      setOutcome({ ...res, clean });
      setResults((r) => [...r, { line, clean, mistakes, hints, due_at: res.due_at, stage: res.stage }]);
      if (mode === "drill" && clean) {
        setStreak((s) => {
          const next = s + 1;
          if (next > loadNumber(BEST_STREAK_KEY)) saveNumber(BEST_STREAK_KEY, next);
          return next;
        });
      }
      // A failed review gets one more go at the end of this session.
      if (mode === "review" && res.result === "again" && !requeued.current.has(line.id)) {
        requeued.current.add(line.id);
        setQueue((q) => [...q, line]);
      }
    } catch (e) {
      submitting.current = false;
      setSaveError(e.message);
    }
  }, [line, mode, serverMode, mistakes, hints]);

  // When the last move of the line has been played.
  useEffect(() => {
    if (!lineOver || outcome || saveError) return;
    if (guided) {
      const t = setTimeout(() => {
        setPass("recall");
        setPly(0);
        setSkipped(0);
        setFeedback({ tone: "info", text: "Now play the same line from memory." });
      }, 700);
      return () => clearTimeout(t);
    }
    // In Learn mode, repeat the recall pass until it goes cleanly (at most 3 tries).
    if (mode === "learn" && mistakes + hints > 1 && recallTries < 2) {
      const t = setTimeout(() => {
        setRecallTries((n) => n + 1);
        setPly(0);
        setMistakes(0);
        setHints(0);
        setWrongHere(0);
        setHintLevel(0);
        setFeedback({ tone: "info", text: "Almost. Once more from the start." });
      }, 700);
      return () => clearTimeout(t);
    }
    submit();
  }, [lineOver, outcome, saveError, guided, mode, mistakes, hints, recallTries, submit]);

  const drillOver = mode === "drill" && outcome && !outcome.clean;
  const isLast = index + 1 >= queue.length;

  const next = useCallback(() => {
    if (!outcome) return;
    if (drillOver || isLast) setFinished(true);
    else startLine(index + 1, queue, mode === "learn" ? "guided" : "recall");
  }, [outcome, drillOver, isLast, index, queue, mode, startLine]);

  function handleMove(from, to) {
    if (!userTurn || outcome) return false;
    if (from === expected.from && to === expected.to) {
      setFeedback({ tone: "good", text: `${expected.san} — correct.` });
      setWrongHere(0);
      setHintLevel(0);
      setWrongSquare(null);
      setPly((p) => p + 1);
      return true;
    }
    if (!isLegal(fen, from, to)) return false;
    if (guided) {
      setFeedback({ tone: "info", text: "Follow the arrow for now. You'll play it from memory next." });
      return false;
    }
    const prefix = line.moves.slice(0, ply).map((m) => m.uci + ",").join("");
    if (knownMoves.has(`${prefix}>${from}${to}`)) {
      setFeedback({ tone: "info", text: "That move is in another of your lines. This one continues differently." });
      return false;
    }
    if (wrongHere === 0) setMistakes((m) => m + 1); // one mistake per move, however many tries
    setWrongHere((n) => n + 1);
    if (wrongHere >= 1) setHintLevel(2); // second miss on the same move: show it
    setWrongSquare(to);
    setTimeout(() => setWrongSquare(null), 500);
    setFeedback({
      tone: "bad",
      text: wrongHere >= 1 ? `The move is ${expected.san}. Play it to continue.` : "Not the move in this line. Try again.",
    });
    return false;
  }

  const showHint = useCallback(() => {
    if (!userTurn || guided || outcome || hintLevel >= 2) return;
    if (hintLevel === 0 && wrongHere === 0) setHints((h) => h + 1);
    setHintLevel((l) => l + 1);
  }, [userTurn, guided, outcome, hintLevel, wrongHere]);

  // Keyboard: Enter/Space = next line, H = hint.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
      if ((e.key === "Enter" || e.key === " ") && outcome) {
        e.preventDefault();
        next();
      } else if (e.key.toLowerCase() === "h") {
        showHint();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcome, next, showHint]);

  if (finished) {
    return <Summary mode={mode} results={results} streak={streak} onExit={onExit} />;
  }

  // ---- board decoration
  const squareStyles = {};
  if (ply > 0) {
    const last = line.moves[ply - 1];
    squareStyles[last.from] = LAST_MOVE;
    squareStyles[last.to] = LAST_MOVE;
  }
  const arrows = [];
  if (userTurn && !outcome) {
    if (guided) arrows.push({ startSquare: expected.from, endSquare: expected.to, color: GUIDE_ARROW });
    else if (hintLevel >= 2) arrows.push({ startSquare: expected.from, endSquare: expected.to, color: HINT_ARROW });
    else if (hintLevel === 1) squareStyles[expected.from] = HINT_SQUARE;
  }
  if (wrongSquare) squareStyles[wrongSquare] = WRONG_SQUARE;

  // In recall, moves appear in the list only once played.
  const shown = guided ? total : ply;
  const status = outcome
    ? null
    : feedback ||
      (userTurn
        ? { tone: "info", text: guided ? "Play the move shown by the arrow." : "Your move." }
        : { tone: "info", text: skipped && ply < skipped ? "Skipping the moves you just played…" : "Opponent is moving…" });

  return (
    <div className="flex-col">
      <div className="session-head">
        <div>
          <span className="session-mode">{MODE_TITLES[mode]}</span>
          <span className="hint">
            {" "}Line {index + 1} of {queue.length}
            {mode === "drill" && ` · streak ${streak} (best ${Math.max(streak, loadNumber(BEST_STREAK_KEY))})`}
          </span>
        </div>
        <button className="btn btn-secondary" onClick={() => (results.length ? setFinished(true) : onExit())}>
          End session
        </button>
      </div>
      <div className="progress"><div style={{ width: `${(100 * (index + (outcome ? 1 : 0))) / queue.length}%` }} /></div>

      <div className="grid-2">
        <Board
          fen={fen}
          orientation={userIsWhite ? "white" : "black"}
          onMove={handleMove}
          interactive={userTurn && !outcome}
          squareStyles={squareStyles}
          arrows={arrows}
        />
        <div className="flex-col">
          <div className="panel">
            <div className="line-title">
              {line.eco && <span className="hint">{line.eco} · </span>}
              {line.name}
            </div>
            <div className="hint">
              You play {line.color}.
              {mode === "learn" && (guided ? " Step 1 of 2: follow the arrows." : " Step 2 of 2: from memory.")}
              {skipped > 0 && !guided && ` Started at move ${Math.floor(skipped / 2) + 1}: the earlier moves match the last line.`}
            </div>
            {line.note && <div className="note-box mt-1">{line.note}</div>}

            <div className="san-list mt-1" aria-label="Moves so far">
              {line.moves.slice(0, shown).map((m, i) => (
                <span key={i} className={i === ply - 1 ? "san current" : i < ply ? "san" : "san upcoming"}>
                  {i % 2 === 0 && <span className="san-num">{i / 2 + 1}.</span>}
                  {m.san}
                </span>
              ))}
              {shown < total && !outcome && <span className="san upcoming">…</span>}
            </div>

            {status && (
              <div className={`commentary-box mt-1 tone-${status.tone}`} role="status" aria-live="polite">
                {status.text}
              </div>
            )}

            {!outcome && !guided && (
              <div className="flex-row mt-1">
                <button className="btn btn-secondary" onClick={showHint} disabled={!userTurn || hintLevel >= 2}>
                  {hintLevel === 0 ? "Hint (H)" : hintLevel === 1 ? "Show the move" : "Move shown"}
                </button>
                <span className="hint">
                  {plural(mistakes, "mistake")} · {plural(hints, "hint")}
                </span>
              </div>
            )}

            {saveError && (
              <div className="error-box mt-1">
                Couldn't save this result: {saveError}
                <div className="mt-1">
                  <button className="btn btn-secondary" onClick={submit}>Try again</button>
                </div>
              </div>
            )}

            {outcome && (
              <div className={`result-box mt-1 ${outcome.clean ? "tone-good" : "tone-bad"}`}>
                <b>
                  {mode === "learn"
                    ? "Line learned."
                    : drillOver
                      ? `Streak over at ${streak}.`
                      : GRADE_TEXT[outcome.result] || "Done."}
                </b>
                <div className="hint">
                  {mode === "drill" || mode === "practice"
                    ? "Practice runs don't change the review schedule."
                    : `Next review ${formatDue(outcome.due_at)}.`}
                </div>
                <button className="btn mt-1" onClick={next} autoFocus>
                  {drillOver || isLast ? "Finish" : "Next line"} (Enter)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ mode, results, streak, onExit }) {
  const clean = results.filter((r) => r.clean).length;
  const best = loadNumber(BEST_STREAK_KEY);
  return (
    <div className="panel">
      <div className="line-title">Session complete</div>
      <div className="stat-grid mt-1">
        <div className="stat-card"><div className="big">{results.length}</div><div className="label">Lines played</div></div>
        <div className="stat-card"><div className="big">{clean}</div><div className="label">Clean</div></div>
        <div className="stat-card">
          <div className="big">{results.length ? Math.round((100 * clean) / results.length) : 0}%</div>
          <div className="label">Accuracy</div>
        </div>
        {mode === "drill" && (
          <div className="stat-card"><div className="big">{streak}</div><div className="label">Streak (best {best})</div></div>
        )}
      </div>
      {results.length > 0 && (
        <table className="data-table mt-2">
          <thead>
            <tr><th>Line</th><th>Result</th><th>{mode === "learn" || mode === "review" ? "Next review" : ""}</th></tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={`${uciKey(r.line)}-${i}`}>
                <td>{r.line.name} <span className="hint">as {r.line.color}</span></td>
                <td>
                  {r.clean
                    ? <span className="chip chip-mastered">Clean</span>
                    : <span className="chip chip-due">{plural(r.mistakes, "mistake")}, {plural(r.hints, "hint")}</span>}
                </td>
                <td className="hint">{mode === "learn" || mode === "review" ? formatDue(r.due_at) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn mt-2" onClick={onExit} autoFocus>Back to training</button>
    </div>
  );
}
