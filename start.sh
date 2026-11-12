#!/usr/bin/env bash
# Sets up (first time) and starts Chess Coach on macOS/Linux.
# All the real work happens in run.py; this only finds Python for you.
cd "$(dirname "$0")" || exit 1

for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    exec "$candidate" run.py "$@"
  fi
done

echo "Python 3.10 or newer was not found."
echo "Install it from https://www.python.org/downloads/ (or your package manager) and run this again."
exit 1
