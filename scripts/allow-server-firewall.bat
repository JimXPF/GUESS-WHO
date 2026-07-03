@echo off
REM 一次性添加防火墙规则（需右键「以管理员身份运行」）
REM 允许 server-go\server.exe 入站，避免每次启动弹窗

set RULE_NAME=GuessWho Server
set EXE=%~dp0..\server-go\server.exe

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 请右键此文件，选择「以管理员身份运行」
  pause
  exit /b 1
)

if not exist "%EXE%" (
  echo [INFO] 先编译 server.exe ...
  pushd "%~dp0..\server-go"
  go build -o server.exe ./cmd/server
  popd
)

netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow program="%EXE%" enable=yes profile=private,public

echo [OK] 已添加防火墙规则：%RULE_NAME%
echo      程序：%EXE%
pause
