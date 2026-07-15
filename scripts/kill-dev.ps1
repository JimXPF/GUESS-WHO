# Stop Guess Who dev processes (API :3001, Vite :5173, previous CMD/session)
param(
    [int]$CurrentSessionPid = 0,
    [switch]$PortsOnly
)

$ErrorActionPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ports = @(3001, 5173)
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

function Stop-ProcessTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    # taskkill /T 比递归 WMI 枚举快得多，避免 start.bat 长时间无输出
    & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
}

function Stop-PortListeners {
    param([int[]]$PortList)
    foreach ($port in $PortList) {
        $connections = @()
        try {
            $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
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
}

function Stop-ProjectNodeProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -like "*$root*" -or
                $_.CommandLine -like '*concurrently*' -or
                $_.CommandLine -like '*tsx watch server/index.ts*' -or
                $_.CommandLine -like '*vite*'
            )
        } |
        ForEach-Object {
            Write-Host "  Node PID $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force
        }
}

function Stop-GoBackendProcesses {
    @('go.exe', 'server.exe') | ForEach-Object {
        Get-CimInstance Win32_Process -Filter "Name = '$_'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and (
                    $_.CommandLine -like "*$root*" -or
                    $_.CommandLine -like '*server-go*' -or
                    $_.CommandLine -like '*cmd/server*'
                )
            } |
            ForEach-Object {
                Write-Host "  Go backend PID $($_.ProcessId)"
                Stop-ProcessTree -ProcessId $_.ProcessId
            }
    }
}

function Stop-PreviousDevTerminals {
    param(
        [int]$KeepSessionPid = 0
    )

    if (Test-Path $pidFile) {
        $raw = (Get-Content $pidFile -Raw).Trim()
        $oldSessionPid = 0
        [void][int]::TryParse($raw, [ref]$oldSessionPid)
        if ($oldSessionPid -gt 0 -and $oldSessionPid -ne $KeepSessionPid) {
            Write-Host "  Previous dev terminal PID $oldSessionPid"
            Stop-ProcessTree -ProcessId $oldSessionPid
        }
    }

    $rootPattern = [regex]::Escape($root)
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name.ToLower() -in @('cmd.exe', 'powershell.exe', 'pwsh.exe') -and
            $_.CommandLine -and
            $_.CommandLine -match $rootPattern -and
            $_.CommandLine -match '(start-dev|dev:inner|dev-server|concurrently|npm run dev)' -and
            $_.ProcessId -ne $KeepSessionPid -and
            $_.ProcessId -ne $PID
        } |
        ForEach-Object {
            Write-Host "  Orphan shell PID $($_.ProcessId)"
            Stop-ProcessTree -ProcessId $_.ProcessId
        }
}

Write-Host '[INFO] Stopping existing Guess Who processes...'

if ($CurrentSessionPid -le 0) {
    $CurrentSessionPid = Get-TerminalSessionPid
}

if (-not $PortsOnly) {
    Stop-PreviousDevTerminals -KeepSessionPid $CurrentSessionPid
    Stop-ProjectNodeProcesses
}

Stop-PortListeners -PortList $ports
Stop-GoBackendProcesses

Start-Sleep -Milliseconds 800
Write-Host '[INFO] Done stopping processes.'
