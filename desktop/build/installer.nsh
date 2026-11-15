; Custom installer steps (electron-builder NSIS).
; PostgreSQL needs the Microsoft Visual C++ 2015-2022 runtime (x64). Most computers already
; have it; if not, the official Microsoft package is downloaded once and installed silently.
!include "LogicLib.nsh"
!include "x64.nsh"

!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  SetRegView 32
  ${If} $0 != 1
    ${DisableX64FSRedirection}
    ${IfNot} ${FileExists} "$WINDIR\System32\msvcp140.dll"
    ${OrIfNot} ${FileExists} "$WINDIR\System32\vcruntime140.dll"
      DetailPrint "Installing Microsoft Visual C++ runtime (one-time)..."
      nsExec::ExecToLog '"$WINDIR\System32\curl.exe" -L -s -o "$TEMP\vc_redist.x64.exe" https://aka.ms/vs/17/release/vc_redist.x64.exe'
      Pop $1
      ${If} ${FileExists} "$TEMP\vc_redist.x64.exe"
        ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $2
        Delete "$TEMP\vc_redist.x64.exe"
        DetailPrint "Visual C++ runtime installer finished ($2)"
      ${Else}
        MessageBox MB_ICONEXCLAMATION|MB_OK "לא ניתן היה להוריד את רכיב Microsoft Visual C++ (נדרש חיבור אינטרנט חד-פעמי בהתקנה).$\r$\nהתקינו אותו ידנית מהאתר של Microsoft: https://aka.ms/vs/17/release/vc_redist.x64.exe ואז הפעילו את התוכנה."
      ${EndIf}
    ${EndIf}
    ${EnableX64FSRedirection}
  ${EndIf}
!macroend
