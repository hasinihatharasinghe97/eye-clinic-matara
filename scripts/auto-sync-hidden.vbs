' Runs one automatic cloud-sync check without opening a window.
' Started every 5 minutes by the Windows scheduled task (clinic-tools.bat, Background sync ON).
' It syncs both ways only when either side has changes and the connection is stable.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run "cmd /c node scripts\cloud-sync.mjs auto >> data\cloud-sync-task.log 2>&1", 0, True
