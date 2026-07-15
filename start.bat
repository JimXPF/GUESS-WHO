@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   Guess Who - Dev Server (Go Backend)
echo ========================================
echo.

REM Release ports before starting
echo [INFO] Releasing ports 3001 and 5173...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-dev.ps1" -PortsOnly
if errorlevel 1 (
  echo [WARN] Port cleanup reported an issue; continuing...
)

REM Optional git pull (skip if offline)
if exist ".git\" (
  where git >nul 2>&1
  if not errorlevel 1 (
    echo [INFO] Pulling latest code...
    git pull --ff-only 2>nul
    if errorlevel 1 (
      echo [WARN] git pull skipped; using local code...
    )
  )
)

echo [INFO] Checking client dependencies...
pushd client
if not exist "node_modules\" (
  echo [INFO] Installing client dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed in client/
    popd
    pause
    exit /b 1
  )
)
popd

echo.
echo ========================================
echo   Starting services...
echo ========================================
echo   Frontend (Vite):  http://localhost:5173
echo   Backend  (Go):    http://localhost:3001
echo.
echo   Tip: If LAN page is blank, check client\.env VITE_DEV_HOST
echo.
echo ========================================
echo.

call npm run dev
if errorlevel 1 (
  echo.
  echo [ERROR] Dev server exited with an error.
  echo         Check Go 1.26+ is installed: go version
  echo         Or run: npm run restart
)

pause
