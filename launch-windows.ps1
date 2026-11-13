param([switch]$IsolatedTest, [switch]$Notify)
$ErrorActionPreference = 'Stop'
# -Notify is used by the hidden desktop shortcut: there is no console to read, so any
# failure is shown in a dialog instead, and success shows nothing at all.
$log = Join-Path $PSScriptRoot '.build\last-launch.log'

# A hidden process cannot take the foreground, so a plain message box can open behind
# other windows. An invisible top-most owner keeps every dialog above them.
function Show-Dialog([string]$text, [string]$buttons = 'OK', [string]$icon = 'Warning', [string]$default = 'Button1') {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    $owner.ShowInTaskbar = $false
    $owner.FormBorderStyle = 'None'
    $owner.Opacity = 0
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.StartPosition = 'CenterScreen'
    $owner.Show()
    $owner.Activate()
    try {
        return [System.Windows.Forms.MessageBox]::Show($owner, $text, 'Codex 启动动画', $buttons, $icon, $default)
    } finally { $owner.Close(); $owner.Dispose() }
}

function Stop-Launch([string]$message, [int]$code = 1) {
    if ($Notify) {
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
            Set-Content -LiteralPath $log -Value $message -Encoding UTF8
        } catch {}
        $text = $message + "`r`n`r`n需要查看完整过程时，请双击项目中的「扩展启动Codex.cmd」。"
        Show-Dialog $text | Out-Null
    } else {
        Write-Host $message
    }
    exit $code
}

# Run a Node script; return its exit code and, on failure, the last lines it printed.
function Invoke-Node([string[]]$arguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Notify) {
            $output = & $script:node @arguments 2>&1 | ForEach-Object { "$_" }
        } else {
            & $script:node @arguments | Out-Host
            $output = @()
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    $tail = ($output | Where-Object { $_.Trim() } | Select-Object -Last 3) -join "`r`n"
    return @{ Code = $code; Message = $tail }
}

try {
    $package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
    if (-not $package -or $package.PackageFamilyName -ne 'OpenAI.Codex_2p2nqsd0c76g0' -or
        $package.Publisher -ne 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B') {
        Stop-Launch '未找到官方 Codex MSIX 包。'
    }
    $exe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { Stop-Launch 'Codex 安装文件不存在。' }

    if (-not $IsolatedTest) {
        # A still-running Codex (this or an earlier MSIX version) would take over the new
        # launch and leave its debugging port with no pages, so it has to exit first.
        # Only processes inside an OpenAI.Codex package folder count: other apps such as
        # the ChatGPT desktop app share the ChatGPT.exe name. A process whose path cannot
        # be read is treated as Codex for detection, but is never closed automatically.
        $codexPath = '\\WindowsApps\\OpenAI\.Codex_[^\\]*_2p2nqsd0c76g0\\'
        function Get-RunningCodex {
            @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { -not $_.Path -or $_.Path -match $codexPath })
        }
        $running = Get-RunningCodex
        if ($running.Count) {
            $question = 'Codex 正在运行（可能只剩系统托盘中的后台进程）。' + "`r`n`r`n" +
                '是否关闭当前 Codex，并带启动动画重新打开？' + "`r`n" +
                'Codex 中正在运行的任务会被中断。'
            if ($Notify) {
                $answer = [string](Show-Dialog $question 'YesNo' 'Question' 'Button2')
            } else {
                Write-Host $question
                $answer = $(if ((Read-Host '输入 Y 关闭并重新打开，其他键取消') -match '^[Yy]') { 'Yes' } else { 'No' })
            }
            # Declining leaves the running Codex untouched and ends quietly.
            if ($answer -ne 'Yes') { exit 10 }
            $running | Where-Object { $_.Path -match $codexPath } | Stop-Process -Force -ErrorAction SilentlyContinue
            $deadline = (Get-Date).AddSeconds(10)
            while ((Get-RunningCodex).Count -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
            if ((Get-RunningCodex).Count) {
                Stop-Launch '未能自动关闭 Codex。请从系统托盘退出 Codex，并在任务管理器中结束 ChatGPT.exe 后重试。' 10
            }
            # Give the single-instance lock a moment to be released.
            Start-Sleep -Milliseconds 800
        }
    }

    $script:node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $script:node) { Stop-Launch '未找到 Node.js。请安装 Node.js 22 或更高版本。' }
    $result = Invoke-Node @((Join-Path $PSScriptRoot 'tools\bootstrap.mjs'))
    if ($result.Code -ne 0) { Stop-Launch ("素材检查失败。`r`n" + $result.Message) $result.Code }
    $arguments = @('extension\run-windows.mjs', '--verified-exe', $exe, '--app-version', [string]$package.Version)
    if ($IsolatedTest) {
        $arguments += @('--isolated-profile', (Join-Path $PSScriptRoot '.build\windows-smoke-profile'))
    }
    Push-Location $PSScriptRoot
    try {
        $result = Invoke-Node $arguments
        if ($result.Code -ne 0) { Stop-Launch ("动画未能接入 Codex。`r`n" + $result.Message) $result.Code }
    } finally { Pop-Location }
} catch {
    Stop-Launch ('启动失败：' + $_.Exception.Message)
}
