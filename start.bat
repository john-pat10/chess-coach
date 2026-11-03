@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem --- Find Python (python.org installer registers "python"; some setups only have "py") ---
set PYTHON_CMD=python
where python >nul 2>nul
if errorlevel 1 (
    where py >nul 2>nul
    if errorlevel 1 (
        echo Python was not found on your PATH.
        echo Install it from https://www.python.org/downloads/ and make sure to
        echo check "Add python.exe to PATH" during setup, then run this again.
        pause
        exit /b 1
    ) else (
        set PYTHON_CMD=py
    )
)

rem --- Find Node/npm ---
where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on your PATH.
    echo Install the LTS version from https://nodejs.org/ then run this again.
    pause
    exit /b 1
)

rem --- Warn (don't block) if Stockfish isn't set up ---
where stockfish >nul 2>nul
if errorlevel 1 (
    if "%STOCKFISH_PATH%"=="" (
        if not exist backend\.env (
            echo.
            echo WARNING: Stockfish wasn't found on your PATH.
            echo Download it from https://stockfishchess.org/download/, then either:
            echo   - add its folder to your PATH, or
            echo   - copy backend\.env.example to backend\.env and set STOCKFISH_PATH
            echo     to the full path of stockfish.exe
            echo Game analysis will fail until this is done. Continuing anyway...
            echo.
        )
    )
)

rem --- First-run setup ---
if not exist backend\.venv (
    echo Setting up the backend for the first time, this can take a minute...
    %PYTHON_CMD% -m venv backend\.venv
    call backend\.venv\Scripts\pip install -q -r backend\requirements.txt
    if errorlevel 1 (
        echo Backend setup failed -- see the error above.
        pause
        exit /b 1
    )
)

if not exist frontend\node_modules (
    echo Installing frontend dependencies for the first time, this can take a minute...
    pushd frontend
    call npm install
    popd
    if errorlevel 1 (
        echo Frontend setup failed -- see the error above.
        pause
        exit /b 1
    )
)

rem --- Launch both in their own windows so you can see their logs ---
echo.
echo Starting the backend and frontend...
start "ChessCoach backend"  "%~dp0backend\run_backend.bat"
start "ChessCoach frontend" "%~dp0frontend\run_frontend.bat"

timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo Two new windows opened: "ChessCoach backend" and "ChessCoach frontend".
echo Leave them running -- closing either one stops that half of the app.
echo Your browser should now be open to http://localhost:5173
echo (If it didn't open, or you closed it, just visit that address again.)
pause
