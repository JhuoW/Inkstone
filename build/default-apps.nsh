; Windows Settings enumerates Capabilities through RegisteredApplications.
; Registration makes Inkstone available; only Windows/user choice sets defaults.
; https://learn.microsoft.com/windows/win32/shell/default-programs
!ifndef INKSTONE_DEFAULT_APPS
!define INKSTONE_DEFAULT_APPS

; The fixture overrides every product-specific registry name and extension.
!define /ifndef INKSTONE_REGISTERED_APP "Inkstone"
!define /ifndef INKSTONE_CAPABILITIES "Software\Inkstone\Capabilities"
!define /ifndef INKSTONE_APPLICATION "Software\Classes\Applications\Inkstone.exe"
!define /ifndef INKSTONE_PROGID "Inkstone.Markdown"
!define /ifndef INKSTONE_EXT_MD ".md"
!define /ifndef INKSTONE_EXT_MARKDOWN ".markdown"
!define /ifndef INKSTONE_EXT_MDOWN ".mdown"
!define /ifndef INKSTONE_EXT_MKD ".mkd"
!define INKSTONE_APP_DESCRIPTION "Inkstone Markdown editor"

!macro InkstoneRegisterDefaultApps EXE
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${INKSTONE_REGISTERED_APP}" "${INKSTONE_CAPABILITIES}"
  WriteRegStr SHELL_CONTEXT "${INKSTONE_CAPABILITIES}" "ApplicationName" "${INKSTONE_REGISTERED_APP}"
  WriteRegStr SHELL_CONTEXT "${INKSTONE_CAPABILITIES}" "ApplicationDescription" "${INKSTONE_APP_DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "${INKSTONE_CAPABILITIES}" "ApplicationIcon" '$\"${EXE}$\",0'
  !insertmacro InkstoneRegisterDefaultType "${INKSTONE_EXT_MD}"
  !insertmacro InkstoneRegisterDefaultType "${INKSTONE_EXT_MARKDOWN}"
  !insertmacro InkstoneRegisterDefaultType "${INKSTONE_EXT_MDOWN}"
  !insertmacro InkstoneRegisterDefaultType "${INKSTONE_EXT_MKD}"

  WriteRegStr SHELL_CONTEXT "${INKSTONE_APPLICATION}" "FriendlyAppName" "${INKSTONE_REGISTERED_APP}"
  WriteRegStr SHELL_CONTEXT "${INKSTONE_APPLICATION}\DefaultIcon" "" '$\"${EXE}$\",0'
  WriteRegStr SHELL_CONTEXT "${INKSTONE_APPLICATION}\shell\open\command" "" '$\"${EXE}$\" $\"%1$\"'
!macroend

!macro InkstoneRegisterDefaultType EXTENSION
  WriteRegStr SHELL_CONTEXT "${INKSTONE_CAPABILITIES}\FileAssociations" "${EXTENSION}" "${INKSTONE_PROGID}"
  WriteRegStr SHELL_CONTEXT "${INKSTONE_APPLICATION}\SupportedTypes" "${EXTENSION}" ""
!macroend

!macro InkstoneDeleteMatchingValue KEY NAME EXPECTED
  ClearErrors
  ReadRegStr $R0 SHELL_CONTEXT "${KEY}" "${NAME}"
  ${IfNot} ${Errors}
  ${AndIf} $R0 == `${EXPECTED}`
    DeleteRegValue SHELL_CONTEXT "${KEY}" "${NAME}"
  ${EndIf}
!macroend

!macro InkstoneDeleteEmptyKey KEY
  ; Builder ships NSIS 3.0.4: /ifempty checks subkeys but ignores values there.
  ; EnumRegValue's error flag also distinguishes an empty-name default value.
  ClearErrors
  EnumRegValue $R0 SHELL_CONTEXT "${KEY}" 0
  ${If} ${Errors}
    DeleteRegKey /ifempty SHELL_CONTEXT "${KEY}"
  ${EndIf}
!macroend

!macro InkstoneUnregisterDefaultApps EXE
  Push $R0
  ; A different installation may have replaced this registration since ours.
  ReadRegStr $R0 SHELL_CONTEXT "${INKSTONE_CAPABILITIES}" "ApplicationIcon"
  ${If} $R0 == '$\"${EXE}$\",0'
    !insertmacro InkstoneDeleteMatchingValue "Software\RegisteredApplications" "${INKSTONE_REGISTERED_APP}" "${INKSTONE_CAPABILITIES}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}" "ApplicationName" "${INKSTONE_REGISTERED_APP}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}" "ApplicationDescription" "${INKSTONE_APP_DESCRIPTION}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}" "ApplicationIcon" '$\"${EXE}$\",0'
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}\FileAssociations" "${INKSTONE_EXT_MD}" "${INKSTONE_PROGID}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}\FileAssociations" "${INKSTONE_EXT_MARKDOWN}" "${INKSTONE_PROGID}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}\FileAssociations" "${INKSTONE_EXT_MDOWN}" "${INKSTONE_PROGID}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_CAPABILITIES}\FileAssociations" "${INKSTONE_EXT_MKD}" "${INKSTONE_PROGID}"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_CAPABILITIES}\FileAssociations"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_CAPABILITIES}"
  ${EndIf}

  ReadRegStr $R0 SHELL_CONTEXT "${INKSTONE_APPLICATION}\shell\open\command" ""
  ${If} $R0 == '$\"${EXE}$\" $\"%1$\"'
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}" "FriendlyAppName" "${INKSTONE_REGISTERED_APP}"
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\DefaultIcon" "" '$\"${EXE}$\",0'
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\shell\open\command" "" '$\"${EXE}$\" $\"%1$\"'
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\SupportedTypes" "${INKSTONE_EXT_MD}" ""
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\SupportedTypes" "${INKSTONE_EXT_MARKDOWN}" ""
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\SupportedTypes" "${INKSTONE_EXT_MDOWN}" ""
    !insertmacro InkstoneDeleteMatchingValue "${INKSTONE_APPLICATION}\SupportedTypes" "${INKSTONE_EXT_MKD}" ""
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}\DefaultIcon"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}\shell\open\command"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}\shell\open"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}\shell"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}\SupportedTypes"
    !insertmacro InkstoneDeleteEmptyKey "${INKSTONE_APPLICATION}"
  ${EndIf}
  Pop $R0
!macroend

!endif
