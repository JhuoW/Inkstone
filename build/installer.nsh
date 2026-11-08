; Installer language handoff. Existing application preferences take priority.
!include "installer-language.nsh"
!include "default-apps.nsh"

!macro customHeader
  ; Expand after electron-builder's FileAssociation include so its default-
  ; changing registration is replaced for both installer build phases.
  !include "file-associations.nsh"
  !define MUI_LANGDLL_ALLLANGUAGES
  !define MUI_LANGDLL_WINDOWTITLE "Inkstone Setup"
  !define MUI_LANGDLL_INFO "Choose the installation language / 请选择安装语言"
  ; Builder's .onInit displays its picker before checking BUILD_UNINSTALLER or
  ; UAC inner instances. We own that guarded display in preInit instead.
  !ifdef DISPLAY_LANG_SELECTOR
    !undef DISPLAY_LANG_SELECTOR
  !endif
  !ifdef MUI_LANGDLL_LANGUAGES
    !undef MUI_LANGDLL_LANGUAGES
  !endif
  !define MUI_LANGDLL_LANGUAGES '"简体中文" "2052" "English" "1033"'
!macroend

!macro preInit
  !ifndef BUILD_UNINSTALLER
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    System::Call 'kernel32::GetUserDefaultUILanguage() i.s'
    Pop $R0
    StrCpy $R1 0
    StrCpy $R2 ""
    StrCpy $R3 0
    ${If} ${UAC_IsInnerInstance}
      StrCpy $R1 1
      !insertmacro UAC_AsUser_GetGlobal $R2 $LANGUAGE
    ${EndIf}
    ${If} ${Silent}
      StrCpy $R3 1
    ${EndIf}
    !insertmacro InkstoneLanguagePolicy $R0 $R1 $R2 $R3 $R4
    ${If} $R4 == 1
      !insertmacro MUI_LANGDLL_DISPLAY
    ${EndIf}
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  !endif
!macroend

!macro InkstoneWriteInstallerLocale
  Push $R0
  Push $R1
  StrCpy $R0 "en"
  ${If} $LANGUAGE == 2052
    StrCpy $R0 "zh-CN"
  ${EndIf}
  ClearErrors
  FileOpen $R1 "$INSTDIR\resources\installer-locale.json.tmp" w
  ${IfNot} ${Errors}
    FileWrite $R1 '{$\"locale$\":$\"$R0$\",$\"configured$\":true}'
    FileClose $R1
    Delete "$INSTDIR\resources\installer-locale.json"
    Rename "$INSTDIR\resources\installer-locale.json.tmp" "$INSTDIR\resources\installer-locale.json"
  ${EndIf}
  ${If} ${Errors}
    ${If} $LANGUAGE == 2052
      MessageBox MB_OK|MB_ICONEXCLAMATION "无法保存安装语言。首次启动后可在偏好设置中切换语言。"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "The install language could not be saved. You can change the language in Preferences after launch."
    ${EndIf}
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

!macro customInstall
  !insertmacro InkstoneWriteInstallerLocale
  !insertmacro InkstoneRegisterDefaultApps "$INSTDIR\Inkstone.exe"
!macroend

!macro customUnInstall
  !insertmacro InkstoneUnregisterDefaultApps "$INSTDIR\Inkstone.exe"
!macroend
