# Start Rust backend (untouched) + local Vite client pointed at it
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$rustDir = Join-Path $root 'server-rust'
$clientDir = Join-Path $root 'client'

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Resolve-RustPort {
    if ($env:RUST_BACKEND_PORT) { return $env:RUST_BACKEND_PORT }
    if ($env:PORT) { return $env:PORT }

    $envFile = Join-Path $rustDir '.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
        if ($line -match '=\s*(\d+)') { return $Matches[1] }
    }

    foreach ($name in @('README.md', 'readme.md', 'README.MD')) {
        $readme = Join-Path $rustDir $name
        if (-not (Test-Path $readme)) { continue }
        $text = Get-Content $readme -Raw -ErrorAction SilentlyContinue
        if ($text -match '(?i)(?:port|listen|listening)[^\d]{0,20}(\d{4,5})') {
            return $Matches[1]
        }
        if ($text -match 'localhost:(\d{4,5})') {
            return $Matches[1]
        }
    }

    return '3001'
}

Set-Location $root

if (-not (Test-Path (Join-Path $rustDir 'Cargo.toml'))) {
    throw "server-rust/Cargo.toml missing. Put the Rust backend at server-rust/ first, then re-run."
}

# Ensure cargo is on PATH (fresh rustup install) before Assert-Command
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

Assert-Command node
Assert-Command npm

# Local runtime env for Rust server (do not commit; do not touch Rust sources)
$rustEnv = Join-Path $rustDir '.env'
$rustEnvExample = Join-Path $rustDir '.env.example'
if (-not (Test-Path $rustEnv) -and (Test-Path $rustEnvExample)) {
    Copy-Item $rustEnvExample $rustEnv
    Write-Host '[INFO] Created server-rust/.env from .env.example'
}

$port = Resolve-RustPort
Write-Host "[INFO] Rust backend port -> $port"

& (Join-Path $PSScriptRoot 'kill-dev.ps1') -PortsOnly
if ($port -ne '3001' -and $port -ne '5173') {
    try {
        $conn = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($conn -and $conn.OwningProcess -gt 0) {
            Write-Host "  Port $port -> PID $($conn.OwningProcess)"
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

if (-not (Test-Path (Join-Path $clientDir 'node_modules'))) {
    Write-Host '[INFO] Installing client dependencies...'
    Push-Location $clientDir
    try { npm install } finally { Pop-Location }
}

# Point local Vite at Rust; set Rust runtime env per its README (no source edits)
$env:VITE_BACKEND_HOST = '127.0.0.1'
$env:VITE_BACKEND_PORT = "$port"
$env:BACKEND_HEALTH_URL = "http://127.0.0.1:$port/api/health"
$env:HOST = '127.0.0.1'
$env:PORT = "$port"
$env:RUST_BACKEND_PORT = "$port"
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'sqlite://guess-game.db' }
if (-not $env:DATA_DIR) { $env:DATA_DIR = '.\data' }
if (-not $env:RUST_LOG) { $env:RUST_LOG = 'guess_game_server=info,tower_http=info' }

Assert-Command cargo

Write-Host '[INFO] Starting Rust backend + Vite client...'
Write-Host "  Frontend: http://localhost:5173  (proxies /api + /socket.io -> :$port)"
Write-Host "  Backend:  http://127.0.0.1:$port"
Write-Host '  Rust code: read-only from this launcher'
Write-Host ''

$cargoArgs = @('run')
if ($env:RUST_RELEASE -eq '1') { $cargoArgs = @('run', '--release') }
$cargoLine = ($cargoArgs -join ' ')

# Run from repo root so npx/concurrently resolve correctly. Never edit Rust sources.
$rustCmd = "cd /d `"$rustDir`" && cargo $cargoLine"
$clientCmd = "node `"$root\scripts\wait-for-backend.js`" && npm run dev --prefix `"$clientDir`""

npx --yes concurrently -k -n rust,client -c yellow,green `
    "cmd /c $rustCmd" `
    "cmd /c $clientCmd"
