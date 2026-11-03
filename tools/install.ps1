param([string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction Stop
& $node.Source (Join-Path $PSScriptRoot 'bootstrap.mjs')
if ($LASTEXITCODE -ne 0) { exit 1 }
if (-not (Test-Path -LiteralPath $ShortcutDirectory -PathType Container)) { throw '快捷方式目录不存在。' }
$shell = New-Object -ComObject WScript.Shell
$start = $shell.CreateShortcut((Join-Path $ShortcutDirectory 'Codex 启动动画.lnk'))
$start.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$start.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + (Join-Path $projectRoot 'launch-windows.ps1') + '"'
$start.WorkingDirectory = $projectRoot
$start.WindowStyle = 7
$start.Save()
$preview = $shell.CreateShortcut((Join-Path $ShortcutDirectory 'Codex 动画预览.lnk'))
$preview.TargetPath = Join-Path $projectRoot 'index.html'
$preview.WorkingDirectory = $projectRoot
$preview.Save()
$change = $shell.CreateShortcut((Join-Path $ShortcutDirectory 'Codex 更换启动素材.lnk'))
$change.TargetPath = Join-Path $projectRoot '更换素材.cmd'
$change.WorkingDirectory = $projectRoot
$change.Save()
Write-Host '安装完成：启动、预览和更换素材快捷方式已创建。移动项目后，请重新运行安装。'
