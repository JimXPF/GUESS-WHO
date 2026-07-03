@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   Guess Who - Dev Server (Go Backend)
echo ========================================
echo.

REM 1. Kill previous dev processes
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-dev.ps1" >nul 2>&1

REM 2. (Optional) git pull
if exist ".git\" (
  where git >nul 2>&1
  if not errorlevel 1 (
    echo [INFO] Pulling latest code...
    git pull --ff-only >nul 2>&1
  )
)

REM 3. Ensure frontend dependencies are installed
echo [INFO] Checking client dependencies...
pushd client
if not exist "node_modules\" (
  echo [INFO] Installing client dependencies...
  call npm install
)
popd

echo.
echo ========================================
echo   Starting services...
echo ========================================
echo   Frontend (Vite):  http://localhost:5173
echo   LAN Frontend:   http://10.253.36.103:5173
echo   Backend  (Go):    http://localhost:3001
echo.
echo   Tip: If LAN page is blank, check client\.env VITE_DEV_HOST
echo.
echo ========================================
echo.

REM 4. Start Go backend + Vite frontend
call npm run dev

pause

