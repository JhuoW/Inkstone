; Executes the same include macros as the application installer, without installing Inkstone.
Unicode true
Name "Inkstone language hook test"
OutFile "${OUTPUT_EXE}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!include "MUI2.nsh"
!addincludedir "${BUILD_RESOURCES_DIR}"
!addincludedir "${BUILDER_NSIS_INCLUDE}"
!addplugindir /x86-unicode "${UAC_PLUGIN_DIR}"
!include "UAC.nsh"
!include "${INKSTONE_INSTALLER_INCLUDE}"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro customHeader

!macro assertLanguage UI INNER PARENT SILENT EXPECTED SHOW
  !insertmacro InkstoneLanguagePolicy ${UI} ${INNER} ${PARENT} ${SILENT} $R4
  ${If} $LANGUAGE != ${EXPECTED}
  ${OrIf} $R4 != ${SHOW}
    SetErrorLevel 20
    Quit
  ${EndIf}
!macroend

Function .onInit
  !ifdef BUILD_UNINSTALLER
    StrCpy $LANGUAGE 1041
  !endif
  !insertmacro preInit
  !ifdef BUILD_UNINSTALLER
    ${If} $LANGUAGE != 1041
      SetErrorLevel 11
      Quit
    ${EndIf}
  !else
    ; Real preInit runs silently: it must use Windows UI language, not force en.
    System::Call 'kernel32::GetUserDefaultUILanguage() i.s'
    Pop $R0
    !insertmacro InkstoneNormalizeUILanguage $R0 $R1
    ${If} $LANGUAGE != $R1
      SetErrorLevel 10
      Quit
    ${EndIf}
  !endif

  ; Chinese variants, non-Chinese UI, silent and elevated subprocesses.
  !insertmacro assertLanguage 2052 0 0 0 2052 1
  !insertmacro assertLanguage 1028 0 0 0 2052 1
  !insertmacro assertLanguage 3076 0 0 0 2052 1
  !insertmacro assertLanguage 4100 0 0 0 2052 1
  !insertmacro assertLanguage 1033 0 0 0 1033 1
  !insertmacro assertLanguage 1041 0 0 0 1033 1
  !insertmacro assertLanguage 1036 0 0 0 1033 1
  !insertmacro assertLanguage 2052 0 0 1 2052 0
  !insertmacro assertLanguage 1033 0 0 1 1033 0
  !insertmacro assertLanguage 2052 1 1033 0 1033 0
  !insertmacro assertLanguage 1033 1 2052 0 2052 0
  !insertmacro assertLanguage 1041 1 2052 1 2052 0
FunctionEnd
Section
  StrCpy $LANGUAGE 1033
  StrCpy $INSTDIR "$EXEDIR\english"
  CreateDirectory "$INSTDIR\resources"
  !insertmacro InkstoneWriteInstallerLocale
  StrCpy $LANGUAGE 2052
  StrCpy $INSTDIR "$EXEDIR\chinese"
  CreateDirectory "$INSTDIR\resources"
  !insertmacro InkstoneWriteInstallerLocale
SectionEnd
