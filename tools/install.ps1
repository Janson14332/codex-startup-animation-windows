param([string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction Stop
& $node.Source (Join-Path $PSScriptRoot 'bootstrap.mjs')
if ($LASTEXITCODE -ne 0) { exit 1 }
if (-not (Test-Path -LiteralPath $ShortcutDirectory -PathType Container)) { throw '快捷方式目录不存在。' }
$shell = New-Object -ComObject WScript.Shell
# WScript.Shell cannot save a shortcut whose file name has characters outside the system
# ANSI code page (e.g. Chinese names on an English Windows). Save under an ASCII name,
# then rename, which handles any Unicode name.
function Save-Shortcut([string]$name, [scriptblock]$configure) {
    $temporary = Join-Path $ShortcutDirectory ('codex-shortcut-' + [guid]::NewGuid().ToString('N') + '.lnk')
    $link = $shell.CreateShortcut($temporary)
    & $configure $link
    $link.Save()
    Move-Item -LiteralPath $temporary -Destination (Join-Path $ShortcutDirectory $name) -Force
}
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launchArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $projectRoot 'launch-windows.ps1') + '" -Notify'
Save-Shortcut 'Codex 启动动画.lnk' {
    param($link)
    # conhost --headless (Windows 10 1809+) runs PowerShell with no console window at all,
    # even when Windows Terminal is the default terminal; failures are shown as a dialog.
    $conhost = Join-Path $env:WINDIR 'System32\conhost.exe'
    if ((Test-Path -LiteralPath $conhost) -and [Environment]::OSVersion.Version.Build -ge 17763) {
        $link.TargetPath = $conhost
        $link.Arguments = '--headless "' + $powershell + '" ' + $launchArguments
    } else {
        $link.TargetPath = $powershell
        $link.Arguments = $launchArguments
    }
    $link.WorkingDirectory = $projectRoot
    $link.WindowStyle = 7
    $link.IconLocation = $powershell + ',0'
}
Save-Shortcut 'Codex 动画预览.lnk' {
    param($link)
    $link.TargetPath = Join-Path $projectRoot 'index.html'
    $link.WorkingDirectory = $projectRoot
}
Save-Shortcut 'Codex 更换启动素材.lnk' {
    param($link)
    # ASCII relay to 更换素材.cmd; a non-ANSI target path cannot be stored on every system locale.
    $link.TargetPath = Join-Path $PSScriptRoot 'change-media.cmd'
    $link.WorkingDirectory = $projectRoot
}
Write-Host '安装完成：启动、预览和更换素材快捷方式已创建。移动项目后，请重新运行安装。'
