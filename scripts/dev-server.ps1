# 开发环境：启动 Go 后端（127.0.0.1:3001）
$ErrorActionPreference = 'Stop'
$serverDir = (Resolve-Path (Join-Path $PSScriptRoot '..\server-go')).Path
Set-Location $serverDir

Write-Host 'INFO Checking Go...'
$goVersion = & go version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: go not found. Install Go 1.26+ and add to PATH.' -ForegroundColor Red
    exit 1
}
Write-Host "INFO $goVersion"

# 释放 3001，避免旧进程占用
try {
    $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn -and $conn.OwningProcess -gt 0) {
        Write-Host "INFO Stopping stale listener on port 3001 (PID $($conn.OwningProcess))"
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 400
    }
} catch {
    Write-Host 'INFO Skip port cleanup (Get-NetTCPConnection unavailable)'
}

$env:HOST = '127.0.0.1'
$env:PORT = '3001'
Write-Host 'INFO Go backend -> http://127.0.0.1:3001'
Write-Host 'INFO Vite :5173 proxies /api and /socket.io here (starts after /api/health is up)'
& go run ./cmd/server
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: go run failed. Need Go 1.26+. Run: go version' -ForegroundColor Red
    exit 1
}
