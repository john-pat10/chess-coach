// Score conversion helpers. The win% and accuracy formulas are the same ones
// lichess's open-source client uses, so numbers should feel familiar.

export const MATE_SCORE_CP = 10000; // cp assigned to mate-in-N, decayed by N

/** Engine score {cp, mate} (side-to-move POV) -> centipawns, same POV. */
export function scoreToCp({ cp, mate }) {
  if (mate != null) {
    if (mate === 0) return -MATE_SCORE_CP; // side to move is mated
    const sign = mate > 0 ? 1 : -1;
    return sign * (MATE_SCORE_CP - Math.abs(mate) * 10);
  }
  return cp ?? 0;
}

/** Centipawns (one side's POV) -> that side's win probability, 0-100. */
export function cpToWinPercent(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Lichess's per-game accuracy % from the average win% lost per move. */
export function accuracyFromAvgWinLoss(avg) {
  const val = 103.1668 * Math.exp(-0.04354 * avg) - 3.1669;
  return Math.max(0, Math.min(100, val));
}

/** Human-readable eval, e.g. '+1.40', '-0.30', '#3', '-#2'. */
export function formatCp(cp) {
  if (Math.abs(cp) >= MATE_SCORE_CP - 200) {
    const n = Math.max(1, Math.round((MATE_SCORE_CP - Math.abs(cp)) / 10));
    return `${cp > 0 ? "" : "-"}#${n}`;
  }
  const v = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${v}` : v;
}
