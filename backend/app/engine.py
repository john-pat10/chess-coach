"""Wrapper around a local Stockfish binary via python-chess's UCI interface.

Stockfish itself is NOT bundled with this project (it's a native binary and
licensing/portability makes bundling messy) -- instead we look for it in a
few common places and let the user point us at it with STOCKFISH_PATH if
none of those work. See the README for install instructions per OS.
"""
from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path
from typing import Optional

import chess
import chess.engine
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Picks up STOCKFISH_PATH from backend/.env if you set one there instead of
# a real environment variable (see .env.example). Safe if no .env exists.
load_dotenv(BACKEND_DIR / ".env")

# `python run.py` can download Stockfish into this folder for you.
LOCAL_BIN_DIR = BACKEND_DIR / "bin"

# Common install locations, by platform, checked after STOCKFISH_PATH and PATH.
_CANDIDATE_PATHS = [
    "/usr/games/stockfish",           # Debian/Ubuntu package
    "/usr/bin/stockfish",
    "/usr/local/bin/stockfish",
    "/opt/homebrew/bin/stockfish",    # Homebrew on Apple Silicon
    "/usr/local/opt/stockfish/bin/stockfish",
    r"C:\Program Files\Stockfish\stockfish.exe",
    r"C:\stockfish\stockfish.exe",
]

INSTALL_HELP = " ".join([
    "Stockfish (the chess engine behind Game Review) was not found.",
    "Easiest fix: run `python run.py` from the project folder and say yes when it offers to download it.",
    "Or install it yourself (macOS: `brew install stockfish`; Ubuntu: `sudo apt install stockfish`;",
    "Windows: download from https://stockfishchess.org/download/)",
    "and put it on your PATH or set STOCKFISH_PATH in backend/.env.",
])


def _is_executable_file(path: Path) -> bool:
    return path.is_file() and (platform.system() == "Windows" or os.access(path, os.X_OK))


def _find_in_dir(folder: Path) -> Optional[str]:
    """A Stockfish binary inside a folder (release zips nest it one level down)."""
    if not folder.is_dir():
        return None
    for path in sorted(folder.rglob("stockfish*")):
        if path.suffix.lower() in ("", ".exe") and _is_executable_file(path):
            return str(path)
    return None


def locate_stockfish() -> str:
    """Find a usable Stockfish executable, or raise a helpful error."""
    env_path = os.environ.get("STOCKFISH_PATH", "").strip().strip('"')
    if env_path:
        p = Path(env_path).expanduser()
        if p.is_file():
            return str(p)
        found = _find_in_dir(p)       # allow pointing at the folder it was unzipped into
        if found:
            return found
        raise RuntimeError(
            f"STOCKFISH_PATH is set to '{env_path}', but there is no Stockfish there. "
            "Fix the path in backend/.env (or remove it to search automatically)."
        )

    found = _find_in_dir(LOCAL_BIN_DIR)
    if found:
        return found

    for name in ("stockfish", "stockfish.exe"):
        found = shutil.which(name)
        if found:
            return found

    for candidate in _CANDIDATE_PATHS:
        if Path(candidate).is_file():
            return candidate

    raise RuntimeError(INSTALL_HELP)


def stockfish_status() -> dict:
    """For the health check: is the engine available, and if not, why."""
    try:
        return {"available": True, "path": locate_stockfish(), "help": None}
    except RuntimeError as e:
        return {"available": False, "path": None, "help": str(e)}


class Engine:
    """A thin, synchronous convenience wrapper around chess.engine.SimpleEngine.

    Use as a context manager:
        with Engine() as engine:
            info = engine.analyse(board, depth=16)
    """

    def __init__(self, path: Optional[str] = None, threads: int = 2, hash_mb: int = 128):
        self.path = path or locate_stockfish()
        self._engine: Optional[chess.engine.SimpleEngine] = None
        self.threads = threads
        self.hash_mb = hash_mb

    def __enter__(self) -> "Engine":
        try:
            self._engine = chess.engine.SimpleEngine.popen_uci(self.path)
        except (OSError, chess.engine.EngineError) as e:
            raise RuntimeError(
                f"Found Stockfish at {self.path} but could not start it ({e}). "
                "It may be the wrong build for this computer -- download another one "
                "from https://stockfishchess.org/download/."
            ) from e
        try:
            self._engine.configure({"Threads": self.threads, "Hash": self.hash_mb})
        except chess.engine.EngineError:
            pass  # older engines may not support every option; not fatal
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._engine is not None:
            try:
                self._engine.quit()
            except Exception:       # engine already died; nothing left to clean up
                pass
            self._engine = None

    def analyse(
        self,
        board: chess.Board,
        depth: int = 16,
        multipv: int = 1,
        movetime_ms: Optional[int] = None,
    ):
        """Return a list of info dicts (length == multipv), best line first."""
        assert self._engine is not None, "Engine must be used as a context manager"
        limit = chess.engine.Limit(depth=depth) if movetime_ms is None else chess.engine.Limit(
            time=movetime_ms / 1000
        )
        result = self._engine.analyse(board, limit, multipv=max(1, multipv))
        if isinstance(result, dict):
            result = [result]
        return result
