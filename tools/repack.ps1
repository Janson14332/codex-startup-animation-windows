$ErrorActionPreference = 'Stop'
$node = Get-Command node.exe -ErrorAction Stop
& $node.Source (Join-Path $PSScriptRoot 'package.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Package build failed' }
