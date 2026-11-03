@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0tools\select-media.ps1"
) else (
  powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0tools\select-media.ps1" -InputFile "%~1"
)
if errorlevel 2 goto cancelled
if errorlevel 1 goto failed
echo.
echo 更新完成。重新打开桌面动画预览即可查看。
pause
exit /b 0
:cancelled
echo 已取消选择，当前素材保持不变。
pause
exit /b 0
:failed
echo.
echo 更新失败，请查看上方错误。
pause
exit /b 1
