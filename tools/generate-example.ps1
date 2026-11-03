$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$bitmap = New-Object System.Drawing.Bitmap 1280,720
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
function Color([string]$hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Rectangle]::new(0,0,1280,720)),(Color '#071427'),(Color '#245878'),90
$g.FillRectangle($gradient,0,0,1280,720)
$star = New-Object System.Drawing.SolidBrush (Color '#b4d7ee')
for ($i=0; $i -lt 90; $i++) { $x=($i*137+37)%1260+10; $y=($i*61+29)%340+15; $g.FillEllipse($star,$x,$y,2,2) }
$moon = New-Object System.Drawing.SolidBrush (Color '#b9e5eb')
$g.FillEllipse($moon,890,87,168,168)
$back = New-Object System.Drawing.SolidBrush (Color '#23516d')
$front = New-Object System.Drawing.SolidBrush (Color '#102b45')
$farPoints = [System.Drawing.Point[]]@([System.Drawing.Point]::new(0,410),[System.Drawing.Point]::new(140,250),[System.Drawing.Point]::new(340,450),[System.Drawing.Point]::new(530,275),[System.Drawing.Point]::new(760,450),[System.Drawing.Point]::new(1000,310),[System.Drawing.Point]::new(1280,440),[System.Drawing.Point]::new(1280,720),[System.Drawing.Point]::new(0,720))
$nearPoints = [System.Drawing.Point[]]@([System.Drawing.Point]::new(0,520),[System.Drawing.Point]::new(230,370),[System.Drawing.Point]::new(500,520),[System.Drawing.Point]::new(770,380),[System.Drawing.Point]::new(1050,540),[System.Drawing.Point]::new(1280,410),[System.Drawing.Point]::new(1280,720),[System.Drawing.Point]::new(0,720))
$g.FillPolygon($back,$farPoints);$g.FillPolygon($front,$nearPoints)
$pen = New-Object System.Drawing.Pen (Color '#5093ac'),2
$g.DrawLines($pen,$nearPoints[0..6])
for ($i=0; $i -le 12; $i++) { $g.DrawLine($pen,640,500,($i*120-80),720) }
foreach($y in @(535,580,640,715)) { $g.DrawLine($pen,0,$y,1280,$y) }
$panel = New-Object System.Drawing.SolidBrush (Color '#0a1d32')
$g.FillRectangle($panel,550,230,180,290)
$light = New-Object System.Drawing.Pen (Color '#b1edf0'),3
$g.DrawRectangle($light,550,230,180,290)
$g.DrawRectangle($light,565,245,150,275)
$g.DrawLine($light,530,520,750,520)
$font = New-Object System.Drawing.Font 'Segoe UI',14
$g.DrawString('CODEX  /  STARTUP',$font,$star,45,655)
$bitmap.Save((Join-Path $root 'examples\artwork.png'),[System.Drawing.Imaging.ImageFormat]::Png)
foreach($item in @($font,$light,$panel,$pen,$front,$back,$moon,$star,$gradient,$g,$bitmap)) { $item.Dispose() }
Write-Host 'Neutral example artwork generated.'
