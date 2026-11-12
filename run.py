#!/usr/bin/env python3
"""One-command launcher for Chess Coach. Works on Windows, macOS and Linux.

    python run.py            set everything up (first run), then start the app
    python run.py --dev      developer mode: auto-reloading backend + Vite dev server
    python run.py --check    only report what is installed and what is missing

It uses nothing outside the Python standard library, so it runs before any
dependency is installed. Everything it installs stays inside this folder
(backend/.venv, frontend/node_modules, backend/bin).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import webbrowser
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"
BIN_DIR = BACKEND / "bin"
IS_WINDOWS = platform.system() == "Windows"
MIN_PYTHON = (3, 10)
MIN_NODE = 20

STOCKFISH_RELEASES = "https://github.com/official-stockfish/Stockfish/releases/latest/download/"


def say(msg: str = "") -> None:
    print(msg, flush=True)


def step(msg: str) -> None:
    say(f"\n==> {msg}")


def fail(msg: str) -> "NoReturn":  # noqa: F821
    say(f"\nERROR: {msg}")
    sys.exit(1)


def run(cmd: list[str], cwd: Path, what: str, env: dict | None = None) -> None:
    try:
        subprocess.run(cmd, cwd=cwd, check=True, env=env)
    except FileNotFoundError:
        fail(f"{what} failed: could not run '{cmd[0]}'.")
    except subprocess.CalledProcessError as e:
        fail(f"{what} failed (exit code {e.returncode}). The output above says why.")


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


# ------------------------------------------------------------------ backend

def ensure_backend() -> None:
    py = venv_python()
    if not py.exists():
        step("Creating the Python environment (first run only)")
        if VENV.exists():
            shutil.rmtree(VENV)      # a half-made environment from an interrupted run
        run([sys.executable, "-m", "venv", str(VENV)], ROOT, "Creating the virtual environment")
    requirements = BACKEND / "requirements.txt"
    stamp = VENV / ".requirements-hash"
    wanted = file_hash(requirements)
    if not stamp.exists() or stamp.read_text().strip() != wanted:
        step("Installing backend packages (this can take a minute)")
        run([str(py), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(requirements)],
            BACKEND, "Installing backend packages")
        stamp.write_text(wanted)


# ------------------------------------------------------------------ frontend

def frontend_env(backend_port: int | None = None) -> dict:
    """The web app talks to the backend on its own address (the backend serves
    it, or Vite proxies /api). Blank out VITE_API_BASE so a leftover
    frontend/.env from an older setup can't pin it to a fixed port."""
    env = {**os.environ, "VITE_API_BASE": ""}
    if backend_port is not None:
        env["VITE_BACKEND_PORT"] = str(backend_port)
    return env


def find_npm() -> str | None:
    return shutil.which("npm")


def node_major() -> int | None:
    node = shutil.which("node")
    if not node:
        return None
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, check=True).stdout
        return int(out.strip().lstrip("v").split(".")[0])
    except (subprocess.CalledProcessError, ValueError, OSError):
        return None


def frontend_is_stale() -> bool:
    built = FRONTEND / "dist" / "index.html"
    if not built.exists():
        return True
    built_at = built.stat().st_mtime
    sources = [FRONTEND / "index.html", FRONTEND / "package.json", FRONTEND / "vite.config.js"]
    sources += [p for p in (FRONTEND / "src").rglob("*") if p.is_file()]
    return any(p.stat().st_mtime > built_at for p in sources if p.exists())


def ensure_frontend(dev: bool) -> None:
    npm = find_npm()
    have_build = (FRONTEND / "dist" / "index.html").exists()
    if npm is None:
        if have_build and not dev:
            say("Note: Node.js is not installed, so the web app can't be rebuilt. Using the existing build.")
            return
        fail("Node.js was not found. Install the LTS version from https://nodejs.org/ "
             "(keep the default options), open a NEW terminal window, and run this again.")
    major = node_major()
    if major is not None and major < MIN_NODE:
        fail(f"Node.js {major} is too old; version {MIN_NODE} or newer is needed. "
             "Install the current LTS from https://nodejs.org/ and run this again.")

    lock = FRONTEND / "package-lock.json"
    stamp = FRONTEND / "node_modules" / ".lock-hash"
    wanted = file_hash(lock) if lock.exists() else "no-lockfile"
    if not stamp.exists() or stamp.read_text().strip() != wanted:
        step("Installing frontend packages (this can take a minute)")
        run([npm, "ci" if lock.exists() else "install", "--no-audit", "--no-fund"], FRONTEND, "Installing frontend packages")
        stamp.write_text(wanted)

    if not dev and frontend_is_stale():
        step("Building the web app")
        run([npm, "run", "build"], FRONTEND, "Building the web app", env=frontend_env())


# ------------------------------------------------------------------ stockfish

def stockfish_status() -> dict:
    """Ask the backend's own detection code, so the launcher and app agree."""
    code = "import json; from app.engine import stockfish_status; print(json.dumps(stockfish_status()))"
    try:
        out = subprocess.run([str(venv_python()), "-c", code], cwd=BACKEND, capture_output=True, text=True, check=True)
        return json.loads(out.stdout.strip().splitlines()[-1])
    except (subprocess.CalledProcessError, ValueError, IndexError, OSError) as e:
        return {"available": False, "path": None, "help": f"Could not check for Stockfish: {e}"}


def stockfish_asset() -> str | None:
    system, machine = platform.system(), platform.machine().lower()
    arm = machine in ("arm64", "aarch64")
    if system == "Windows":
        return "stockfish-windows-arm64-universal.zip" if arm else "stockfish-windows-x86-64-universal.zip"
    if system == "Darwin":
        return "stockfish-macos-universal.tar.gz"
    if system == "Linux" and (arm or machine in ("x86_64", "amd64")):
        return "stockfish-linux-arm64-universal.tar.gz" if arm else "stockfish-linux-x86-64-universal.tar.gz"
    return None


def _safe_members(names: list[str], dest: Path) -> None:
    root = dest.resolve()
    for name in names:
        target = (dest / name).resolve()
        if root != target and root not in target.parents:
            raise RuntimeError(f"Refusing to unpack a file outside {dest}: {name}")


def download_stockfish() -> bool:
    asset = stockfish_asset()
    if asset is None:
        say("There is no ready-made Stockfish download for this computer; see the README to install it yourself.")
        return False
    url = STOCKFISH_RELEASES + asset
    BIN_DIR.mkdir(exist_ok=True)
    archive = BIN_DIR / asset
    say(f"Downloading {url}")
    try:
        with urllib.request.urlopen(url, timeout=60) as resp, open(archive, "wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            done = 0
            while chunk := resp.read(1 << 20):
                out.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {done >> 20} / {total >> 20} MB", end="", flush=True)
        print()
        if asset.endswith(".zip"):
            with zipfile.ZipFile(archive) as z:
                _safe_members(z.namelist(), BIN_DIR)
                z.extractall(BIN_DIR)
        else:
            with tarfile.open(archive) as t:
                _safe_members(t.getnames(), BIN_DIR)
                t.extractall(BIN_DIR)
        if not IS_WINDOWS:
            for p in BIN_DIR.rglob("stockfish*"):
                if p.is_file() and p.suffix == "":
                    p.chmod(0o755)
    except (urllib.error.URLError, OSError, zipfile.BadZipFile, tarfile.TarError, RuntimeError) as e:
        say(f"\nThe download did not work ({e}).")
        return False
    finally:
        archive.unlink(missing_ok=True)
    return True


def ensure_stockfish(assume_yes: bool, skip: bool) -> None:
    status = stockfish_status()
    if status["available"]:
        say(f"Stockfish: {status['path']}")
        return
    say("\nStockfish (the chess engine) was not found on this computer.")
    say("Game Review needs it. Opponent Scout and the Openings Trainer work without it.")
    if skip:
        return
    if not assume_yes:
        if not sys.stdin.isatty():
            say("Run `python run.py --yes` to download it automatically (about 80 MB, from the official Stockfish GitHub releases).")
            return
        try:
            answer = input("Download it now into backend/bin? About 80 MB, from the official Stockfish GitHub releases. [Y/n] ")
        except EOFError:
            answer = "n"
        if answer.strip().lower() not in ("", "y", "yes"):
            say("Skipped. You can run this again any time, or install Stockfish yourself (see README).")
            return
    if download_stockfish():
        status = stockfish_status()
        if status["available"]:
            say(f"Stockfish installed: {status['path']}")
        else:
            say("Stockfish was downloaded but could not be found afterwards; see the README to set STOCKFISH_PATH.")


# ------------------------------------------------------------------ running

def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def pick_port(preferred: int) -> int:
    for port in range(preferred, preferred + 20):
        if not port_in_use(port):
            if port != preferred:
                say(f"Port {preferred} is busy, using {port} instead.")
            return port
    fail(f"Ports {preferred}-{preferred + 19} are all in use. Close the other program or pass --port.")


def wait_for_backend(port: int, proc: subprocess.Popen, timeout: float = 40.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.4)
    return False


def stop(procs: list[subprocess.Popen]) -> None:
    for p in procs:
        if p.poll() is None:
            p.terminate()
    for p in procs:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()


def serve(port: int, dev: bool, open_browser: bool) -> int:
    port = pick_port(port)
    procs: list[subprocess.Popen] = []
    backend_cmd = [str(venv_python()), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)]
    if dev:
        backend_cmd.append("--reload")
    step("Starting Chess Coach")
    try:
        backend = subprocess.Popen(backend_cmd, cwd=BACKEND)
        procs.append(backend)
        if not wait_for_backend(port, backend):
            stop(procs)
            fail("The backend did not start. The messages above say why.")

        url = f"http://localhost:{port}"
        if dev:
            web_port = pick_port(5173)
            procs.append(subprocess.Popen(
                [find_npm(), "run", "dev", "--", "--port", str(web_port), "--strictPort"],
                cwd=FRONTEND, env=frontend_env(port)))
            url = f"http://localhost:{web_port}"
            time.sleep(2)

        say("\n" + "=" * 60)
        say(f"  Chess Coach is running at  {url}")
        say("  Leave this window open. Press Ctrl+C here to stop it.")
        say("=" * 60 + "\n")
        if open_browser:
            webbrowser.open(url)
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
        say("\nOne of the processes stopped; shutting down.")
        return 1
    except KeyboardInterrupt:
        say("\nStopping...")
        return 0
    finally:
        stop(procs)


def check() -> int:
    """Report what is and isn't in place, without changing anything."""
    ok = True

    def line(label: str, good: bool, detail: str) -> None:
        nonlocal ok
        ok = ok and good
        say(f"  [{'ok' if good else '!!'}] {label}: {detail}")

    say("Chess Coach setup check")
    line("Python", sys.version_info >= MIN_PYTHON, platform.python_version())
    major = node_major()
    line("Node.js", major is not None and major >= MIN_NODE,
         f"v{major}" if major else "not found (https://nodejs.org/)")
    requirements = BACKEND / "requirements.txt"
    stamp = VENV / ".requirements-hash"
    packages_ok = venv_python().exists() and stamp.exists() and stamp.read_text().strip() == file_hash(requirements)
    line("Backend packages", packages_ok, "installed" if packages_ok else "not installed, or out of date")
    built = (FRONTEND / "dist" / "index.html").exists()
    fresh = built and not frontend_is_stale()
    line("Web app build", fresh, "built" if fresh else ("out of date" if built else "not built yet"))
    if venv_python().exists():
        sf = stockfish_status()
        say(f"  [{'ok' if sf['available'] else '--'}] Stockfish (optional, for Game Review): {sf['path'] or 'not found'}")
    say("\nEverything is ready." if ok else "\nRun `python run.py` to set up what is missing.")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up and run Chess Coach.")
    parser.add_argument("--dev", action="store_true", help="developer mode: auto-reload backend + Vite dev server")
    parser.add_argument("--port", type=int, default=8000, help="port for the app (default 8000)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    parser.add_argument("--check", action="store_true", help="only report what is installed")
    parser.add_argument("--setup-only", action="store_true", help="install everything but don't start the app")
    parser.add_argument("-y", "--yes", action="store_true", help="download Stockfish without asking if it is missing")
    parser.add_argument("--skip-stockfish", action="store_true", help="never offer to download Stockfish")
    args = parser.parse_args()

    if sys.version_info < MIN_PYTHON:
        fail(f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]} or newer is needed; this is {platform.python_version()}. "
             "Install a newer one from https://www.python.org/downloads/.")
    if args.check:
        return check()

    ensure_backend()
    ensure_frontend(args.dev)
    ensure_stockfish(args.yes, args.skip_stockfish)
    if args.setup_only:
        say("\nSetup complete. Run `python run.py` to start the app.")
        return 0
    return serve(args.port, args.dev, not args.no_browser)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
