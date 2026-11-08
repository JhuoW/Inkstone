; Register Inkstone as an available editor without changing the user's default.
; package.json supplies an Inkstone-specific ProgID; never use a generic class.
!ifndef INKSTONE_OPENWITH_ASSOCIATIONS
!define INKSTONE_OPENWITH_ASSOCIATIONS

!ifmacrodef APP_ASSOCIATE
  !macroundef APP_ASSOCIATE
!endif
!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${FILECLASS}"

  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}" "" `${DESCRIPTION}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\DefaultIcon" "" `${ICON}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open" "" `${COMMANDTEXT}`
  ; Builder's COMMAND expands an unquoted $appExe. Quote the executable itself
  ; so installation paths containing spaces or Chinese remain one argv entry.
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open\command" "" '$\"$appExe$\" $\"%1$\"'
!macroend

; A stale uninstaller must not remove a newer installation's registration.
; Cache ownership before the first extension removes the common ProgID.
!ifmacrodef APP_UNASSOCIATE
  !macroundef APP_UNASSOCIATE
!endif
!macro APP_UNASSOCIATE EXT FILECLASS
  !ifndef INKSTONE_UNINSTALL_OWNERSHIP_VARIABLE
    !define INKSTONE_UNINSTALL_OWNERSHIP_VARIABLE
    Var /GLOBAL InkstoneUninstallOwnAssociations
  !endif
  Push $R0
  ${If} $InkstoneUninstallOwnAssociations == ""
    StrCpy $InkstoneUninstallOwnAssociations 0
    ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open\command" ""
    ${If} $R0 == '$\"$INSTDIR\Inkstone.exe$\" $\"%1$\"'
      StrCpy $InkstoneUninstallOwnAssociations 1
    ${EndIf}
  ${EndIf}
  ${If} $InkstoneUninstallOwnAssociations == 1
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${FILECLASS}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${FILECLASS}"
  ${EndIf}
  Pop $R0
!macroend
!endif
