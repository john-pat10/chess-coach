@echo off
rem Runs ChessCoach locally. (You don't need this to use the hosted version
rem on GitHub Pages -- just open the site link in the README.)
cd /d "%~dp0frontend"

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on your PATH.
    echo Install the LTS version from https://nodejs.org/ then run this again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies for the first time, this can take a minute...
    call npm install
    if errorlevel 1 (
        echo Setup failed -- see the error above.
        pause
        exit /b 1
    )
)

echo Starting ChessCoach at http://localhost:5173 ...
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
