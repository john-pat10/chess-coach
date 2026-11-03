@echo off
rem Run directly if you want (double-click), or let start.bat launch this for you.
cd /d "%~dp0"
npm run dev
echo.
echo Frontend stopped (or failed to start -- scroll up for the error).
pause
