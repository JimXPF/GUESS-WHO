@echo off
setlocal
cd /d "%~dp0..\server-go"

echo INFO Checking Go...
go version >nul 2>&1
if errorlevel 1 (
  echo ERROR: go not found. Install Go 1.26+ and add to PATH.
  exit /b 1
)

set HOST=127.0.0.1
set PORT=3001
echo INFO Go backend - http://127.0.0.1:3001
go run ./cmd/server
if errorlevel 1 (
  echo ERROR: go run failed. Need Go 1.26+. Run: go version
  exit /b 1
)
