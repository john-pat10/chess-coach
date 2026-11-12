@echo off
rem Double-click this to set up (first time) and start Chess Coach.
rem All the real work happens in run.py; this only finds Python for you.
setlocal
cd /d "%~dp0"

set PYTHON_CMD=
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if not errorlevel 1 set PYTHON_CMD=python
if not defined PYTHON_CMD (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 set PYTHON_CMD=py -3
)
if not defined PYTHON_CMD (
    echo Python 3.10 or newer was not found.
    echo.
    echo Install it from https://www.python.org/downloads/ and tick
    echo "Add python.exe to PATH" in the installer, then double-click this again.
    echo ^(The Microsoft Store version of Python often does not work; use python.org.^)
    echo.
    pause
    exit /b 1
)

%PYTHON_CMD% run.py %*
if errorlevel 1 (
    echo.
    echo Chess Coach stopped with an error. The messages above explain why.
    pause
)
