# Stop Guess Who dev processes (API :3001, Vite :5173, project node children)
$ErrorActionPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ports = @(3001, 5173)

Write-Host '[INFO] Stopping existing Guess Who processes...'

foreach ($port in $ports) {
    $connections = @()
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen
    } catch {
        $connections = netstat -ano | Select-String ":$port\s" | Select-String 'LISTENING'
        foreach ($line in $connections) {
            $parts = ($line -replace '\s+', ' ').ToString().Trim().Split(' ')
            $processId = [int]$parts[-1]
            if ($processId -gt 0) {
                Write-Host "  Port $port -> PID $processId"
                Stop-Process -Id $processId -Force
            }
        }
        continue
    }

    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        if ($processId -gt 0) {
            Write-Host "  Port $port -> PID $processId"
            Stop-Process -Id $processId -Force
        }
    }
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$root*" } |
    ForEach-Object {
        Write-Host "  Node PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force
    }

Start-Sleep -Seconds 1
Write-Host '[INFO] Done stopping processes.'
