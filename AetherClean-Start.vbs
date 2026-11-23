Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = appDir

' Clear ELECTRON_RUN_AS_NODE so Electron runs as full GUI Desktop App
On Error Resume Next
Set env = WshShell.Environment("PROCESS")
env.Remove("ELECTRON_RUN_AS_NODE")
On Error GoTo 0

electronExe = appDir & "\node_modules\electron\dist\electron.exe"
WshShell.Run """" & electronExe & """ .", 0, False