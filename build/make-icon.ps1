# Regenere les icones d'Appli Finance (Windows PowerShell 5.1) :
#   build\icon.png, build\icon.ico, icons\icon-192.png, icons\icon-512.png, icons\icon-maskable-512.png
Add-Type -AssemblyName System.Drawing
$build = Split-Path -Parent $MyInvocation.MyCommand.Path
$root  = Split-Path -Parent $build
$icons = Join-Path $root 'icons'
if (-not (Test-Path $icons)) { New-Item -ItemType Directory -Path $icons | Out-Null }

function C($hex){ [System.Drawing.ColorTranslator]::FromHtml($hex) }
function RR($x,$y,$w,$h,$r){
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Max(0.01, 2*$r)
  $p.AddArc($x,$y,$d,$d,180,90); $p.AddArc($x+$w-$d,$y,$d,$d,270,90)
  $p.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90); $p.AddArc($x,$y+$h-$d,$d,$d,90,90)
  $p.CloseFigure(); return $p
}

# $mode : 'rounded' (coins arrondis, fond transparent autour) | 'maskable' (carre plein, contenu dans la zone sure)
function Draw-Icon([int]$S, [string]$mode){
  $bmp = New-Object System.Drawing.Bitmap $S,$S,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.Clear([System.Drawing.Color]::Transparent)

  # fond
  $bg = New-Object System.Drawing.SolidBrush (C '#0D1520')
  if ($mode -eq 'maskable') {
    $g.FillRectangle($bg, 0, 0, $S, $S)
  } else {
    $m = if ($S -ge 64) { 0.5 } else { 0 }
    $path = RR $m $m ($S-2*$m) ($S-2*$m) ($S*0.20)
    $g.FillPath($bg, $path); $path.Dispose()
    if ($S -ge 64) {
      $pen = New-Object System.Drawing.Pen (C '#22303F'), ([Math]::Max(1,$S/256))
      $pp = RR ($m+$pen.Width/2) ($m+$pen.Width/2) ($S-2*$m-$pen.Width) ($S-2*$m-$pen.Width) ($S*0.20)
      $g.DrawPath($pen,$pp); $pp.Dispose(); $pen.Dispose()
    }
  }
  $bg.Dispose()

  # anneau (camembert evide) : accent dore + 3 couleurs de categories
  $k = if ($mode -eq 'maskable') { 0.27 } else { 0.33 }      # rayon exterieur / taille
  $R = $S * $k
  $w = $R * 0.44                                              # epaisseur de l'anneau
  $rm = $R - $w/2                                             # rayon median
  $c = $S / 2.0
  $rect = New-Object System.Drawing.RectangleF ([single]($c-$rm)), ([single]($c-$rm)), ([single](2*$rm)), ([single](2*$rm))
  $gap = if ($S -ge 48) { 6 } else { 0 }
  $segs = @(
    @{ col = '#DFA65C'; len = 180 },
    @{ col = '#6FD5A3'; len = 80 },
    @{ col = '#B48CF2'; len = 60 },
    @{ col = '#5AB8F2'; len = 40 }
  )
  $a = -90.0
  foreach ($sg in $segs) {
    $pen = New-Object System.Drawing.Pen (C $sg.col), ([single]$w)
    $pen.StartCap = 'Flat'; $pen.EndCap = 'Flat'
    $g.DrawArc($pen, $rect, [single]($a + $gap/2.0), [single]($sg.len - $gap))
    $pen.Dispose()
    $a += $sg.len
  }
  # point central dore (centre du camembert)
  if ($S -ge 64) {
    $dr = $rm * 0.16
    $b = New-Object System.Drawing.SolidBrush (C '#DFA65C')
    $g.FillEllipse($b, $c-$dr, $c-$dr, 2*$dr, 2*$dr); $b.Dispose()
  }
  $g.Dispose(); return $bmp
}
function PngBytes($bmp){ $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); $ms.ToArray() }
function SavePng($bmp, $file){ $bmp.Save($file,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }

# PNG
SavePng (Draw-Icon 512 'rounded')  (Join-Path $build 'icon.png')
SavePng (Draw-Icon 512 'rounded')  (Join-Path $icons 'icon-512.png')
SavePng (Draw-Icon 192 'rounded')  (Join-Path $icons 'icon-192.png')
SavePng (Draw-Icon 512 'maskable') (Join-Path $icons 'icon-maskable-512.png')

# ICO (16..256, images PNG)
$sizes = 16,24,32,48,64,128,256
$imgs = foreach ($s in $sizes) { $bm = Draw-Icon $s 'rounded'; ,(PngBytes $bm); $bm.Dispose() }
$ms = New-Object System.IO.MemoryStream; $bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$off = 6 + 16*$sizes.Count
for ($i=0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $wb = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$wb); $bw.Write([byte]$wb); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$imgs[$i].Length); $bw.Write([UInt32]$off)
  $off += $imgs[$i].Length
}
foreach ($d in $imgs) { $bw.Write([byte[]]$d) }
$bw.Flush(); [System.IO.File]::WriteAllBytes((Join-Path $build 'icon.ico'), $ms.ToArray())
Write-Host "Termine"
