#!/usr/bin/env bash
# SLCR Progress Tracker - Linux / macOS launcher
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Creating Python environment..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
if [ ! -f instance/tracker.db ]; then
  echo
  echo "First-time setup: creating the database and administrator account."
  .venv/bin/python manage.py init --with-roster
fi
echo
echo "Open http://127.0.0.1:${PORT:-8000} in your browser. Press Ctrl+C to stop."
exec .venv/bin/python app.py
