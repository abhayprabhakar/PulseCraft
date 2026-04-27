@echo off
cd backend
echo Starting Raptor Analytics Backend...
uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
pause
