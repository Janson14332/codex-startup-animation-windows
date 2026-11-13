param([string]$InputFile = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
    $node = Get-Command node.exe -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($InputFile)) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        try {
            $dialog.Title = '选择启动动画视频、动图或图片'
            $dialog.Filter = '视频、动图或图片|*.mp4;*.mov;*.m4v;*.mkv;*.webm;*.avi;*.gif;*.png;*.jpg;*.jpeg;*.webp;*.bmp|视频|*.mp4;*.mov;*.m4v;*.mkv;*.webm;*.avi|GIF 动图|*.gif|图片|*.png;*.jpg;*.jpeg;*.webp;*.bmp'
            $dialog.InitialDirectory = Join-Path $projectRoot '素材'
            $dialog.Multiselect = $false
            if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
            $InputFile = $dialog.FileName
        } finally { $dialog.Dispose() }
    }
    & $node.Source (Join-Path $PSScriptRoot 'update-media.mjs') $InputFile
    if ($LASTEXITCODE -ne 0) { exit 1 }
    & (Join-Path $PSScriptRoot 'repack.ps1')
    exit 0
} catch {
    Write-Host ('更新失败：' + $_.Exception.Message)
    exit 1
}
