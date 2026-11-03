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

# Picks up STOCKFISH_PATH from backend/.env if you set one there instead of
# a real environment variable (see .env.example). Safe to call even if no
# .env file exists.
load_dotenv()

# Common install locations, by platform, checked after STOCKFISH_PATH and PATH.
_CANDIDATE_PATHS = [
    "/usr/games/stockfish",           # Debian/Ubuntu package
    "/usr/bin/stockfish",
    "/usr/local/bin/stockfish",
    "/opt/homebrew/bin/stockfish",    # Homebrew on Apple Silicon
    "/usr/local/opt/stockfish/bin/stockfish",
    "C:\\Program Files\\Stockfish\\stockfish.exe",
    "C:\\stockfish\\stockfish.exe",
]


def locate_stockfish() -> str:
    """Find a usable Stockfish executable, or raise a helpful error."""
    env_path = os.environ.get("STOCKFISH_PATH")
    if env_path and Path(env_path).is_file():
        return env_path

    which_name = "stockfish.exe" if platform.system() == "Windows" else "stockfish"
    found = shutil.which(which_name)
    if found:
        return found

    for candidate in _CANDIDATE_PATHS:
        if Path(candidate).is_file():
            return candidate

    raise RuntimeError(
        "Could not find a Stockfish executable.\n"
        "Install it and either put it on your PATH or set STOCKFISH_PATH.\n"
        "  macOS:   brew install stockfish\n"
        "  Ubuntu:  sudo apt install stockfish\n"
        "  Windows: download from https://stockfishchess.org/download/ and\n"
        "           set STOCKFISH_PATH to the .exe location.\n"
    )


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
        self._engine = chess.engine.SimpleEngine.popen_uci(self.path)
        try:
            self._engine.configure({"Threads": self.threads, "Hash": self.hash_mb})
        except chess.engine.EngineError:
            pass  # older engines may not support every option; not fatal
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._engine is not None:
            self._engine.quit()
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
