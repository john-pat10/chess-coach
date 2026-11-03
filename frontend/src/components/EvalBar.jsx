// Converts a centipawn score (White's POV) into a 0-100 fill height using
// the same win% curve the analysis engine uses, so the bar and the numbers
// next to it always agree.
function cpToWhitePercent(cp) {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export default function EvalBar({ cp, label }) {
  const whitePercent = cpToWhitePercent(cp ?? 0);
  return (
    <div className="flex-col" style={{ alignItems: "center", height: "100%" }}>
      <div className="eval-bar-outer" style={{ height: 420 }}>
        <div className="eval-bar-white" style={{ height: `${whitePercent}%` }} />
      </div>
      {label && <div className="hint" style={{ marginTop: 6 }}>{label}</div>}
    </div>
  );
}
