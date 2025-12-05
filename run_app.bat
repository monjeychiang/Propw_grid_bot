@echo off
setlocal

echo ==========================================
echo       Starting Propw Trading Bot
echo ==========================================

set VENV_PY=.\.venv\Scripts\python.exe

if not exist "%VENV_PY%" (
    echo [ERROR] Virtual env not found at %VENV_PY%
    echo Please create it first: py -3.11 -m venv .venv ^& .venv\Scripts\activate ^& pip install -r requirements.txt
    pause
    exit /b 1
)

:: 1. Start Backend Server (uvicorn, uses venv python)
echo [1/3] Starting Backend Server...
start "Propw Backend" cmd /k "%VENV_PY% -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"

:: 2. Start Frontend Server
echo [2/3] Starting Frontend Server...
pushd frontend
start "Propw Frontend" cmd /k "npm run dev"
popd

:: 3. Open Web Interface
echo [3/3] Opening Web Interface...
timeout /t 5 >nul
start http://localhost:5173

echo.
echo ==========================================
echo       System Started Successfully!
echo ==========================================
echo Backend API: http://localhost:8000
echo Frontend UI: http://localhost:5173
echo.
pause
