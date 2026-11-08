; Executes the same include macros as the application installer, without installing Inkstone.
Unicode true
Name "Inkstone language hook test"
OutFile "${OUTPUT_EXE}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!include "${INKSTONE_REPO}/build/installer.nsh"
Function .onInit
  !insertmacro preInit
  ${If} $LANGUAGE != 1033
    SetErrorLevel 10
    Quit
  ${EndIf}
FunctionEnd
Section
  StrCpy $INSTDIR "$EXEDIR\english"
  CreateDirectory "$INSTDIR\resources"
  !insertmacro customInstall
  StrCpy $LANGUAGE 2052
  StrCpy $INSTDIR "$EXEDIR\chinese"
  CreateDirectory "$INSTDIR\resources"
  !insertmacro customInstall
SectionEnd
