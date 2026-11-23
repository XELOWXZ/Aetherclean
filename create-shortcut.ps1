$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\AetherClean Pro.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"c:\Users\HCR-H01\Downloads\comclean\AetherClean-Start.vbs`""
$Shortcut.WorkingDirectory = "c:\Users\HCR-H01\Downloads\comclean"
$Shortcut.IconLocation = "c:\Users\HCR-H01\Downloads\comclean\tray-icon.ico,0"
$Shortcut.Description = "AetherClean Pro - PC Optimization & Windows Tuner"
$Shortcut.Save()
Write-Output "Shortcut created at $DesktopPath\AetherClean Pro.lnk"