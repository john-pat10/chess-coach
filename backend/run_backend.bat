@echo off
rem Run directly if you want (double-click), or let start.bat launch this for you.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
uvicorn app.main:app --port 8000
echo.
echo Backend stopped (or failed to start -- scroll up for the error).
pause
