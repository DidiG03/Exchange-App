; Close Exchange Bureau before install/update (manual installer or updater)
!macro customInit
  DetailPrint "Closing Exchange Bureau if running..."
  nsExec::ExecToLog 'taskkill /F /IM "Exchange Bureau.exe" /T'
  Pop $0
  Sleep 1500
!macroend
