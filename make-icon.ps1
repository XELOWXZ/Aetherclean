Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Clear transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Draw glowing emerald & cyan gradient circle
$rect = New-Object System.Drawing.Rectangle 1, 1, 30, 30
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(16, 185, 129)), ([System.Drawing.Color]::FromArgb(0, 240, 255)), 45.0
$g.FillEllipse($brush, $rect)

# Draw cyan glowing ring
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255)), 2.0
$g.DrawEllipse($pen, 3, 3, 26, 26)

# Draw bolt in center
$boltBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$points = @(
    (New-Object System.Drawing.Point 17, 7),
    (New-Object System.Drawing.Point 11, 16),
    (New-Object System.Drawing.Point 16, 16),
    (New-Object System.Drawing.Point 14, 25),
    (New-Object System.Drawing.Point 21, 14),
    (New-Object System.Drawing.Point 16, 14)
)
$g.FillPolygon($boltBrush, $points)

$g.Dispose()

# Save PNG and ICO
$iconPathPng = [System.IO.Path]::Combine($PSScriptRoot, "tray-icon.png")
$iconPathIco = [System.IO.Path]::Combine($PSScriptRoot, "tray-icon.ico")

$bmp.Save($iconPathPng, [System.Drawing.Imaging.ImageFormat]::Png)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Create($iconPathIco)
$icon.Save($fs)
$fs.Close()
$bmp.Dispose()

Write-Output "Successfully generated tray-icon.png and tray-icon.ico"