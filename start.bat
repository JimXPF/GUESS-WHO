@echo off

setlocal EnableDelayedExpansion

cd /d "%~dp0"



where node >nul 2>&1

if errorlevel 1 (

  echo [ERROR] Node.js is not installed or not in PATH.

  echo Download: https://nodejs.org/

  pause

  exit /b 1

)



echo.

echo ========================================

echo   Guess Who - Restart Dev Server

echo ========================================

echo.



REM 1. Stop existing dev processes

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-dev.ps1"

if errorlevel 1 (

  echo [WARN] Could not stop all processes, continuing anyway...

)



REM 2. Update code (git) if repository exists

if exist ".git\" (

  where git >nul 2>&1

  if not errorlevel 1 (

    echo [INFO] Pulling latest code...

    git pull --ff-only

    if errorlevel 1 (

      echo [WARN] git pull failed or skipped, using local files.

    )

  )

)



REM 3. Update dependencies

echo [INFO] Updating root dependencies...

call npm install

if errorlevel 1 (

  echo [ERROR] npm install failed.

  pause

  exit /b 1

)



echo [INFO] Updating client dependencies...

pushd client

call npm install

if errorlevel 1 (

  echo [ERROR] client npm install failed.

  popd

  pause

  exit /b 1

)

popd



echo.

echo ========================================

echo   Guess Who - Dev Server

echo ========================================

echo   Local:   http://localhost:5173

echo   API:     http://localhost:3001

echo   LAN:     see terminal output

echo   Press Ctrl+C to stop.

echo ========================================

echo.



REM 4. Start dev server

call npm run dev



pause

