@echo off
rem ASCII-named entry for the desktop shortcut. WScript.Shell cannot store a shortcut
rem target with characters outside the system ANSI code page, so the shortcut points
rem here and this relays to the real script (and any dragged-in file).
chcp 65001 >nul
call "%~dp0..\更换素材.cmd" %*
