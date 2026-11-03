@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)
if "%~1"=="" (
  node tools\update-media.mjs
) else (
  node tools\update-media.mjs "%~1"
)
if errorlevel 1 goto failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\repack.ps1"
if errorlevel 1 goto failed
echo.
echo 更新完成。双击桌面动画预览即可查看。
pause
exit /b 0
:failed
echo.
echo 更新失败，旧的动画素材已尽量保留。请查看上方错误。
pause
exit /b 1
