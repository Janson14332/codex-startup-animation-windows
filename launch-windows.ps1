param([switch]$IsolatedTest, [switch]$Notify)
$ErrorActionPreference = 'Stop'
# -Notify is used by the hidden desktop shortcut: there is no console to read, so any
# failure is shown in a dialog instead, and success shows nothing at all.
$log = Join-Path $PSScriptRoot '.build\last-launch.log'

function Stop-Launch([string]$message, [int]$code = 1) {
    if ($Notify) {
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
            Set-Content -LiteralPath $log -Value $message -Encoding UTF8
        } catch {}
        Add-Type -AssemblyName System.Windows.Forms
        $text = $message + "`r`n`r`n需要查看完整过程时，请双击项目中的「扩展启动Codex.cmd」。"
        [System.Windows.Forms.MessageBox]::Show($text, 'Codex 启动动画', 'OK', 'Warning') | Out-Null
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
        # A still-running window from the previous MSIX version can take over a
        # new launch, leaving the new process's debugging port with no pages.
        $running = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
        if ($running) {
            Stop-Launch '仍有 Codex 后台进程。请从系统托盘完全退出 Codex，确认任务管理器中没有 ChatGPT.exe 后再启动；当前窗口未被修改。' 10
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
