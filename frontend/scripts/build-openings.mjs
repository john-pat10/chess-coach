// Converts the lichess-org/chess-openings TSVs (frontend/data/*.tsv, MIT
// licensed) into src/data/openings.json: one [eco, name, "uci uci ..."] row
// per named line. Moves are validated here so the browser never has to
// parse SAN at startup.
//
// Run with: npm run build:openings   (only needed if the TSVs change)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
let skipped = 0;

for (const letter of "abcde") {
  const text = readFileSync(join(root, "data", `${letter}.tsv`), "utf8");
  const lines = text.split("\n").slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split("\t");
    const chess = new Chess();
    const ucis = [];
    let ok = true;
    for (const token of pgn.trim().split(/\s+/)) {
      if (/^\d+\.+$/.test(token)) continue;
      try {
        const m = chess.move(token);
        ucis.push(m.from + m.to + (m.promotion ?? ""));
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) {
      skipped++;
      continue;
    }
    rows.push([eco, name, ucis.join(" ")]);
  }
}

const out = join(root, "src", "data", "openings.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(rows));
console.log(`Wrote ${rows.length} openings to ${out} (${skipped} skipped)`);
