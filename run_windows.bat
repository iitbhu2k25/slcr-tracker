@echo off
REM SLCR Progress Tracker - Windows launcher
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating Python environment...
  python -m venv .venv || goto :nopython
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
if not exist "instance\tracker.db" (
  echo.
  echo First-time setup: creating the database and administrator account.
  ".venv\Scripts\python.exe" manage.py init --with-roster
)
echo.
echo Open http://127.0.0.1:8000 in your browser. Close this window to stop the app.
".venv\Scripts\python.exe" app.py
pause
goto :eof
:nopython
echo Python 3.10 or newer is required. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
