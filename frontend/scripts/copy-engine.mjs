// Copies the single-threaded "lite" Stockfish WASM build from the `stockfish`
// npm package into public/engine/, so Vite serves it as a static file and
// the app works on any static host (GitHub Pages included) with no special
// headers. Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish", "bin");
const dest = join(root, "public", "engine");
mkdirSync(dest, { recursive: true });

for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  copyFileSync(join(src, file), join(dest, file));
}
copyFileSync(join(root, "node_modules", "stockfish", "Copying.txt"), join(dest, "COPYING.txt"));
console.log("Copied Stockfish engine to public/engine/");
