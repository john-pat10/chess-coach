const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  analyze: (pgn, depth = 14, criticalDepth = 18) =>
    request("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ pgn, depth, critical_depth: criticalDepth }),
    }),

  scoutOpponent: (platform, username, maxGames = 100) =>
    request(
      `/api/opponent/${platform}/${encodeURIComponent(username)}?max_games=${maxGames}`
    ),

  openingsTree: (movesUci = []) =>
    request(`/api/openings/tree?moves=${movesUci.join(",")}`),

  openingsSearch: (q, limit = 60) =>
    request(`/api/openings/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  openingsLine: (eco, name) =>
    request(`/api/openings/line?eco=${encodeURIComponent(eco)}&name=${encodeURIComponent(name)}`),

  listRepertoire: () => request("/api/repertoire"),

  addRepertoireLine: (line) =>
    request("/api/repertoire", { method: "POST", body: JSON.stringify(line) }),

  deleteRepertoireLine: (id) =>
    request(`/api/repertoire/${id}`, { method: "DELETE" }),

  trainerSummary: () => request("/api/trainer/summary"),

  trainerNext: () => request("/api/trainer/next"),

  trainerAttempt: (lineId, result) =>
    request("/api/trainer/attempt", {
      method: "POST",
      body: JSON.stringify({ line_id: lineId, result }),
    }),
};
