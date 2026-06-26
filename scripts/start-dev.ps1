# Start dev server after killing previous session (ports, node, old CMD window)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root '.dev-session.pid'

function Get-TerminalSessionPid {
    param([int]$StartPid = $PID)
    $sessionPid = $StartPid
    $p = $StartPid
    while ($p) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        $name = $proc.Name.ToLower()
        if ($name -in @('cmd.exe', 'powershell.exe', 'pwsh.exe', 'windowsterminal.exe', 'wt.exe')) {
            $sessionPid = $p
        }
        $p = $proc.ParentProcessId
    }
    return $sessionPid
}

Set-Location $root

$sessionPid = Get-TerminalSessionPid
& (Join-Path $PSScriptRoot 'kill-dev.ps1') -CurrentSessionPid $sessionPid

Set-Content -Path $pidFile -Value $sessionPid -Encoding ascii -NoNewline
Write-Host "[INFO] Dev session PID $sessionPid (saved to .dev-session.pid)"
Write-Host '[INFO] Starting Guess Who dev...'

npm run dev:inner
