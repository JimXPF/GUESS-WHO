@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   Guess Who - Dev Server (Rust Backend)
echo ========================================
echo.
echo   Frontend: local Vite (this repo)
echo   Backend:  server-rust/ (already on disk)
echo   Note: Rust sources are NEVER modified.
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

if not exist "%~dp0server-rust\Cargo.toml" (
  echo [ERROR] server-rust\Cargo.toml not found.
  echo         Place the Rust backend under server-rust\ then re-run.
  echo.
  pause
  exit /b 1
)

echo [INFO] Starting Rust backend + local frontend...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-rust-dev.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Rust-backed dev stack failed.
  echo         1^) Ensure server-rust\ exists with Cargo.toml
  echo         2^) Ensure cargo works: cargo --version
  echo         3^) Ensure node works: node --version
  echo.
)

pause
