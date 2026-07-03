# 开发环境：编译并启动 Go 后端（127.0.0.1:3001）
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

Write-Host 'INFO Building server.exe...'
& go build -o server.exe ./cmd/server
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: go build failed. Need Go 1.26+. Run: go version' -ForegroundColor Red
    exit 1
}

$env:HOST = '127.0.0.1'
$env:PORT = '3001'
Write-Host 'INFO Go backend -> http://127.0.0.1:3001'
Write-Host 'INFO Vite :5173 proxies /api and /socket.io here'
& (Join-Path $serverDir 'server.exe')
