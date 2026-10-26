@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   Guess Who - Dev Server (Rust Backend)
echo ========================================
echo.
echo   Frontend: local Vite (this repo)
echo   Backend:  PWA_Server_Rust/
echo.

where cargo >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  )
)
where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Rust toolchain not found. Install then reopen terminal:
  echo         https://rustup.rs/
  echo         Or: winget install --id Rustlang.Rustup -e --source winget
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0PWA_Server_Rust\Cargo.toml" (
  echo [ERROR] PWA_Server_Rust\Cargo.toml not found.
  echo         Clone gitlab.shdev.net/pvp_web/guess_game_server into PWA_Server_Rust\
  echo.
  pause
  exit /b 1
)

echo [INFO] Starting Rust backend + local frontend...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-rust-dev.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Rust-backed dev stack failed.
  echo         1^) Ensure PWA_Server_Rust\ exists with Cargo.toml
  echo         2^) Ensure cargo works: cargo --version
  echo         3^) Ensure node works: node --version
  echo.
)

pause
