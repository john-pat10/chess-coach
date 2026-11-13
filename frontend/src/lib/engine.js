// Stockfish running in the browser, as a Web Worker. Uses the single-threaded
// "lite" WASM build (copied to public/engine/ by scripts/copy-engine.mjs),
// which needs no special server headers -- so it runs on GitHub Pages.
//
// Two ways to use it:
//   await engine.analyse(fen, { depth, multipv })  -> lines, best first
//   engine.startInfinite(fen, { multipv, onInfo }) -> streams lines until
//   engine.stop()
//
// Every line is { depth, cp, mate, pv: [uci, ...] } with the score from the
// SIDE TO MOVE's point of view (UCI convention).

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

function parseInfo(line) {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  const tokens = line.split(" ");
  const out = { depth: 0, multipv: 1, cp: null, mate: null, pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "depth") out.depth = Number(tokens[++i]);
    else if (t === "multipv") out.multipv = Number(tokens[++i]);
    else if (t === "score") {
      const kind = tokens[++i];
      const val = Number(tokens[++i]);
      if (kind === "cp") out.cp = val;
      else if (kind === "mate") out.mate = val;
      // skip optional lowerbound/upperbound
      if (tokens[i + 1] === "lowerbound" || tokens[i + 1] === "upperbound") {
        out.bound = tokens[++i];
      }
    } else if (t === "pv") {
      out.pv = tokens.slice(i + 1);
      break;
    }
  }
  return out;
}

export class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listeners = new Set();
    this.worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      for (const l of this.listeners) l(line);
    };
    this.worker.onerror = (e) => {
      this.loadError = e.message || "Stockfish failed to load.";
    };
    this.chain = Promise.resolve();
    this.gen = 0;
    this.running = false;
    this.ready = this._init();
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  _waitFor(pred, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(fn);
        reject(new Error(this.loadError || "Stockfish did not respond."));
      }, timeoutMs);
      const fn = (line) => {
        if (pred(line)) {
          clearTimeout(timer);
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
    });
  }

  async _init() {
    this.send("uci");
    await this._waitFor((l) => l === "uciok");
    this.send("setoption name Hash value 32");
    this.send("isready");
    await this._waitFor((l) => l === "readyok");
  }

  _enqueue(job) {
    const p = this.chain.then(() => this.ready).then(job);
    this.chain = p.catch(() => {});
    return p;
  }

  _run(fen, goCmd, { multipv = 1, onInfo } = {}) {
    return new Promise((resolve) => {
      this.running = true;
      const lines = [];
      let lastEmit = 0;
      const fn = (line) => {
        if (line.startsWith("bestmove")) {
          this.listeners.delete(fn);
          this.running = false;
          onInfo?.(lines.filter(Boolean).slice(), true);
          resolve(lines.filter(Boolean));
          return;
        }
        const info = parseInfo(line);
        if (!info || info.bound) return;
        lines[info.multipv - 1] = info;
        if (onInfo) {
          const now = performance.now();
          if (now - lastEmit > 120) {
            lastEmit = now;
            onInfo(lines.filter(Boolean).slice(), false);
          }
        }
      };
      this.listeners.add(fn);
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`position fen ${fen}`);
      this.send(goCmd);
    });
  }

  /** Fixed-depth search. Resolves with lines (best first). */
  analyse(fen, { depth = 12, multipv = 1 } = {}) {
    return this._enqueue(() => this._run(fen, `go depth ${depth}`, { multipv }));
  }

  /**
   * Streaming search: sends lines to onInfo as the engine deepens, until it
   * reaches maxDepth (or forever, if maxDepth is null) or stop() is called.
   */
  startInfinite(fen, { multipv = 3, onInfo, maxDepth = null }) {
    this.stop();
    const myGen = this.gen;
    return this._enqueue(() => {
      if (myGen !== this.gen) return [];
      return this._run(fen, maxDepth ? `go depth ${maxDepth}` : "go infinite", {
        multipv,
        onInfo: (lines, done) => {
          if (myGen === this.gen) onInfo(lines, done);
        },
      });
    });
  }

  stop() {
    this.gen++;
    if (this.running) this.send("stop");
  }

  terminate() {
    this.stop();
    this.worker.terminate();
  }
}
