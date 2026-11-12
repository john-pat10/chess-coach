export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const STAGES = {
  new: { label: "New", hint: "Not learned yet" },
  due: { label: "Due", hint: "Ready to review" },
  learning: { label: "Learning", hint: "In the review cycle" },
  mastered: { label: "Mastered", hint: "Review gap of 3+ weeks" },
};

/** ["e4", "e5", "Nf3"] -> "1. e4 e5 2. Nf3" */
export function movesText(sans) {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ");
}

/** "Sicilian Defense: Dragon Variation" -> "Sicilian Defense" */
export const familyOf = (name) => name.split(":")[0].trim();

/** "Sicilian Defense: Dragon Variation" -> "Dragon Variation" (or "Main line") */
export function variationOf(name) {
  const i = name.indexOf(":");
  return i === -1 ? "Main line" : name.slice(i + 1).trim();
}

export const uciKey = (line) => line.moves.map((m) => m.uci).join(",");

/** How many opening moves two lines share. */
export function commonPrefix(a, b) {
  let i = 0;
  while (i < a.moves.length && i < b.moves.length && a.moves[i].uci === b.moves[i].uci) i++;
  return i;
}

export function formatDue(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

export function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Small localStorage helpers that never throw (private windows, blocked storage). */
export function loadNumber(key, fallback = 0) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}
export function saveNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}
