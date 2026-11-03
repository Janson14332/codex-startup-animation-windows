@echo off
chcp 65001 >nul
node "%~dp0tools\bootstrap.mjs"
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本，并检查示例素材是否完整。
  pause
  exit /b 1
)
start "" "%~dp0index.html"
