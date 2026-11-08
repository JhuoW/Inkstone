; Local installer language handoff. Existing application preferences take priority.
; This hook runs before electron-builder's language selector in .onInit.
!macro customHeader
  !define MUI_LANGDLL_ALLLANGUAGES
  !define MUI_LANGDLL_WINDOWTITLE "Inkstone Setup"
  !define MUI_LANGDLL_INFO "Choose the language for installation and first launch."
!macroend

!macro preInit
  StrCpy $LANGUAGE 1033
!macroend

!macro customInstall
  Push $R0
  Push $R1
  StrCpy $R0 "en"
  ${If} $LANGUAGE == 2052
    StrCpy $R0 "zh-CN"
  ${EndIf}
  ClearErrors
  FileOpen $R1 "$INSTDIR\resources\installer-locale.json.tmp" w
  ${IfNot} ${Errors}
    FileWrite $R1 '{$\"locale$\":$\"$R0$\"}'
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
