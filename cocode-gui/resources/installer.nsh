!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cli-installer.ps1" install -InstallDir "$INSTDIR"'
  Pop $0
  Pop $1
  StrCmp $0 "0" +3
  MessageBox MB_ICONSTOP "Cocode CLI registration failed: $1"
  Abort
!macroend

!macro customUnInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cli-installer.ps1" uninstall -InstallDir "$INSTDIR"'
  Pop $0
  Pop $1
  StrCmp $0 "0" +2
  DetailPrint "Cocode CLI cleanup was skipped or failed: $1"
!macroend
