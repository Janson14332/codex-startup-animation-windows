@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-windows.ps1" -Console
if errorlevel 1 (
  echo.
  echo 请查看上方提示，按任意键关闭窗口。
  pause >nul
)
