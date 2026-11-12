// By default the API is reached on the same address as the page: the backend
// serves the built app directly, and in dev mode Vite proxies /api to it
// (see vite.config.js). Set VITE_API_BASE only to point at a backend elsewhere.
const API_BASE = import.meta.env.VITE_API_BASE || "";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status; // 0 = could not reach the backend at all
  }
}

function describe(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ");
  }
  return fallback;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new ApiError(
      "Can't reach the Chess Coach backend. Make sure the window you started it from is still open, then try again.",
      0
    );
  }
  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* not JSON (e.g. a proxy error page) */
    }
    const fallback =
      res.status >= 500
        ? "The backend isn't responding properly. Check the window it's running in."
        : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(describe(detail, fallback), res.status);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

export const api = {
  health: () => request("/api/health"),

  analyze: (pgn, depth = 14, criticalDepth = 18) =>
    post("/api/analyze", { pgn, depth, critical_depth: criticalDepth }),

  scoutOpponent: (platform, username, maxGames = 100) =>
    request(`/api/opponent/${platform}/${encodeURIComponent(username)}?max_games=${maxGames}`),

  // --- opening book
  openingsTree: (movesUci = []) => request(`/api/openings/tree?moves=${movesUci.join(",")}`),
  openingsSearch: (q, limit = 60) => request(`/api/openings/search?${qs({ q, limit })}`),
  openingsLine: (eco, name) => request(`/api/openings/line?${qs({ eco, name })}`),

  // --- repertoire
  listRepertoire: () => request("/api/repertoire"),
  addRepertoireLine: (line) => post("/api/repertoire", line),
  addOpenings: (color, openings, source = "manual") =>
    post("/api/repertoire/bulk", { color, openings: openings.map(({ eco, name }) => ({ eco, name })), source }),
  importPgn: (color, pgn) => post("/api/repertoire/import-pgn", { color, pgn }),
  updateRepertoireLine: (id, changes) =>
    request(`/api/repertoire/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  deleteRepertoireLine: (id) => request(`/api/repertoire/${id}`, { method: "DELETE" }),
  deleteRepertoireLines: (ids) => post("/api/repertoire/delete", { ids }),
  coverage: (color) => request(`/api/repertoire/coverage?color=${color}`),

  // --- trainer
  trainerStats: () => request("/api/trainer/stats"),
  trainerAttempt: (lineId, { mode, mistakes = 0, hints = 0 }) =>
    post("/api/trainer/attempt", { line_id: lineId, mode, mistakes, hints }),
};
