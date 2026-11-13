// Opponent scouting: pull a player's public games from Lichess or chess.com
// (both APIs allow browser requests), classify each game by opening, and
// surface where they actually lose points.
import { Chess } from "chess.js";
import { classify } from "./openings.js";
import { splitGames } from "./pgn.js";

async function fetchLichess(username, maxGames) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${maxGames}&moves=true&opening=false&clocks=false&evals=false`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/x-chess-pgn" } });
  } catch {
    throw new Error(
      "Couldn't connect to lichess.org. If lichess.org doesn't open in your browser either, " +
        "this network is blocking it (common on school or work Wi-Fi) or Lichess is down -- " +
        "try another network, or scout on chess.com instead."
    );
  }
  if (res.status === 404) throw new Error(`No Lichess account found for '${username}'.`);
  if (res.status === 429) throw new Error("Lichess rate-limited this request -- wait a minute and try again.");
  if (!res.ok) throw new Error(`Lichess returned an error (${res.status}).`);
  return splitGames(await res.text());
}

async function fetchChesscom(username, maxGames) {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
  let res;
  try {
    res = await fetch(base);
  } catch {
    throw new Error(
      "Couldn't connect to chess.com. If chess.com doesn't open in your browser either, " +
        "this network is blocking it or chess.com is down -- try another network."
    );
  }
  if (res.status === 404) throw new Error(`No chess.com account found for '${username}'.`);
  if (!res.ok) throw new Error(`chess.com returned an error (${res.status}).`);
  const archives = ((await res.json()).archives ?? []).reverse(); // newest month first
  const pgns = [];
  for (const url of archives) {
    if (pgns.length >= maxGames) break;
    const r = await fetch(url);
    if (!r.ok) continue;
    const games = ((await r.json()).games ?? []).reverse(); // newest game first
    for (const g of games) {
      if (g.pgn && (g.rules ?? "chess") === "chess") pgns.push(g.pgn);
      if (pgns.length >= maxGames) break;
    }
  }
  return pgns;
}

function header(pgn, key) {
  const m = new RegExp(`^\\[${key} "([^"]*)"\\]`, "m").exec(pgn);
  return m ? m[1] : null;
}

function subjectScore(result, isWhite) {
  if (result === "1-0") return isWhite ? 1 : 0;
  if (result === "0-1") return isWhite ? 0 : 1;
  if (result === "1/2-1/2") return 0.5;
  return null;
}

/** UCI moves of a game's opening phase (first 30 plies is plenty for the book). */
function openingUcis(pgn) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return null;
  }
  return chess
    .history({ verbose: true })
    .slice(0, 30)
    .map((m) => m.from + m.to + (m.promotion ?? ""));
}

export async function buildScoutingReport(platform, username, maxGames = 100) {
  const pgns =
    platform === "lichess" ? await fetchLichess(username, maxGames) : await fetchChesscom(username, maxGames);
  if (!pgns.length) throw new Error(`No public games found for '${username}' on ${platform}.`);

  const asWhite = new Map();
  const asBlack = new Map();
  let analyzed = 0;
  let skipped = 0;
  const uname = username.toLowerCase();

  for (const pgn of pgns) {
    if (header(pgn, "SetUp") === "1" || header(pgn, "Variant") && header(pgn, "Variant") !== "Standard") {
      skipped++;
      continue;
    }
    const white = (header(pgn, "White") ?? "").toLowerCase();
    const black = (header(pgn, "Black") ?? "").toLowerCase();
    const isWhite = white === uname ? true : black === uname ? false : null;
    const score = isWhite === null ? null : subjectScore(header(pgn, "Result"), isWhite);
    const ucis = score === null ? null : openingUcis(pgn);
    if (ucis === null) {
      skipped++;
      continue;
    }
    const opening = classify(ucis);
    const key = opening ? `${opening.eco}|${opening.name}` : "UNKNOWN";
    const bucket = isWhite ? asWhite : asBlack;
    if (!bucket.has(key)) {
      bucket.set(key, {
        eco: opening?.eco ?? null,
        name: opening?.name ?? "Unclassified opening",
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        score: 0,
      });
    }
    const s = bucket.get(key);
    s.games++;
    s.score += score;
    if (score === 1) s.wins++;
    else if (score === 0.5) s.draws++;
    else s.losses++;
    analyzed++;
  }

  const asDict = (s) => ({
    eco: s.eco,
    name: s.name,
    games: s.games,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    score_rate: s.games ? Math.round((s.score / s.games) * 1000) / 1000 : 0,
  });
  const ranked = (b) =>
    [...b.values()]
      .filter((s) => s.games >= 2 && s.eco)
      .map(asDict)
      .sort((a, c) => a.score_rate - c.score_rate);
  const mostCommon = (b) => [...b.values()].map(asDict).sort((a, c) => c.games - a.games).slice(0, 10);

  const w = ranked(asWhite);
  const bl = ranked(asBlack);
  return {
    platform,
    username,
    games_fetched: pgns.length,
    games_analyzed: analyzed,
    games_skipped: skipped,
    as_white: { most_common: mostCommon(asWhite), weakest: w.slice(0, 8) },
    as_black: { most_common: mostCommon(asBlack), weakest: bl.slice(0, 8) },
    recommendations: { when_they_have_white: w.slice(0, 5), when_they_have_black: bl.slice(0, 5) },
  };
}
