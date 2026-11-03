param([switch]$IsolatedTest)
$ErrorActionPreference = 'Stop'

$package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
if (-not $package -or $package.PackageFamilyName -ne 'OpenAI.Codex_2p2nqsd0c76g0' -or
    $package.Publisher -ne 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B') {
    throw '未找到官方 Codex MSIX 包。'
}
$exe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Codex 安装文件不存在。' }

if (-not $IsolatedTest) {
    # A still-running window from the previous MSIX version can take over a
    # new launch, leaving the new process's debugging port with no pages.
    $running = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host '仍有 Codex 后台进程。请从系统托盘完全退出 Codex，确认任务管理器中没有 ChatGPT.exe 后再启动；当前窗口未被修改。'
        exit 10
    }
}

$node = Get-Command node.exe -ErrorAction Stop
& $node.Source (Join-Path $PSScriptRoot 'tools\bootstrap.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$arguments = @('extension\run-windows.mjs', '--verified-exe', $exe, '--app-version', [string]$package.Version)
if ($IsolatedTest) {
    $arguments += @('--isolated-profile', (Join-Path $PSScriptRoot '.build\windows-smoke-profile'))
}
Push-Location $PSScriptRoot
try {
    & $node.Source @arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
