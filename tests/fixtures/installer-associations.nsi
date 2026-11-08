; Exercises real builder macros only in random, disposable test registry keys.
Unicode true
Name "Inkstone association hook test"
OutFile "${OUTPUT_EXE}"
RequestExecutionLevel user
SilentInstall silent
Var appExe
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!addincludedir "${BUILD_RESOURCES_DIR}"
!define EXISTING_EXT "inkstone_fixture_${TEST_TOKEN}_existing"
!define BLANK_EXT "inkstone_fixture_${TEST_TOKEN}_blank"
!define OTHER_CLASS "Inkstone.AssociationFixture.Other.${TEST_TOKEN}"
!define OWN_CLASS "Inkstone.AssociationFixture.Own.${TEST_TOKEN}"
!define INKSTONE_REGISTERED_APP "Inkstone.AssociationFixture.${TEST_TOKEN}"
!define INKSTONE_CAPABILITIES "Software\Inkstone.AssociationFixture.${TEST_TOKEN}\Capabilities"
!define INKSTONE_APPLICATION "Software\Classes\Applications\Inkstone.AssociationFixture.${TEST_TOKEN}.exe"
!define INKSTONE_PROGID "${OWN_CLASS}"
!define INKSTONE_EXT_MD ".${EXISTING_EXT}"
!define INKSTONE_EXT_MARKDOWN ".${BLANK_EXT}"
!define INKSTONE_EXT_MDOWN ".inkstone_fixture_${TEST_TOKEN}_mdown"
!define INKSTONE_EXT_MKD ".inkstone_fixture_${TEST_TOKEN}_mkd"
!include "${INKSTONE_INSTALLER_INCLUDE}"
!include "${FILE_ASSOCIATIONS_INCLUDE}"

; Mirror builder ordering: registration body is defined before customHeader.
!macro registerTestAssociations
  !insertmacro APP_ASSOCIATE "${EXISTING_EXT}" "${OWN_CLASS}" "Markdown document" "$appExe,0" "Open with Inkstone" "$appExe $\"%1$\""
  !insertmacro APP_ASSOCIATE "${BLANK_EXT}" "${OWN_CLASS}" "Markdown document" "$appExe,0" "Open with Inkstone" "$appExe $\"%1$\""
!macroend
!insertmacro customHeader

Section
  SetShellVarContext current
  SetRegView 64
  StrCpy $INSTDIR "${TEST_INSTALL_DIR}"
  StrCpy $appExe "$INSTDIR\Inkstone.exe"
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/replace-owner" $1
  ${IfNot} ${Errors}
    WriteRegStr HKCU "Software\RegisteredApplications" "${INKSTONE_REGISTERED_APP}" "Software\OtherFixture\Capabilities"
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}" "ApplicationIcon" '$\"C:\Other Inkstone\Inkstone.exe$\",0'
    WriteRegStr HKCU "${INKSTONE_APPLICATION}\shell\open\command" "" '$\"C:\Other Inkstone\Inkstone.exe$\" $\"%1$\"'
    WriteRegStr HKCU "Software\Classes\${OWN_CLASS}\shell\open\command" "" '$\"C:\Other Inkstone\Inkstone.exe$\" $\"%1$\"'
    Goto done
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/remove-sentinels" $1
  ${IfNot} ${Errors}
    DeleteRegValue HKCU "${INKSTONE_CAPABILITIES}" ""
    DeleteRegValue HKCU "${INKSTONE_CAPABILITIES}" "FixtureSentinel"
    DeleteRegValue HKCU "${INKSTONE_CAPABILITIES}\FileAssociations" ".inkstone_fixture_${TEST_TOKEN}_untouched"
    DeleteRegValue HKCU "${INKSTONE_APPLICATION}" "FixtureSentinel"
    DeleteRegValue HKCU "${INKSTONE_APPLICATION}\SupportedTypes" ".inkstone_fixture_${TEST_TOKEN}_untouched"
    DeleteRegKey HKCU "${INKSTONE_APPLICATION}\shell\edit"
    Goto done
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/change-values" $1
  ${IfNot} ${Errors}
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}" "ApplicationDescription" "Keep a changed description"
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}\FileAssociations" "${INKSTONE_EXT_MKD}" "${OTHER_CLASS}"
    WriteRegStr HKCU "${INKSTONE_APPLICATION}\SupportedTypes" "${INKSTONE_EXT_MKD}" "Keep a changed supported type"
    Goto done
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/unregister" $1
  ${IfNot} ${Errors}
    !insertmacro InkstoneUnregisterDefaultApps "$appExe"
    !insertmacro APP_UNASSOCIATE "${EXISTING_EXT}" "${OWN_CLASS}"
    !insertmacro APP_UNASSOCIATE "${BLANK_EXT}" "${OWN_CLASS}"
  ${Else}
    WriteRegStr HKCU "Software\Classes\.${EXISTING_EXT}" "" "${OTHER_CLASS}"
    WriteRegStr HKCU "Software\Classes\.${EXISTING_EXT}" "FixtureSentinel" "preserve-extension-data"
    WriteRegNone HKCU "Software\Classes\.${EXISTING_EXT}\OpenWithProgids" "${OTHER_CLASS}"
    WriteRegStr HKCU "Software\Classes\.${BLANK_EXT}" "FixtureSentinel" "preserve-blank-extension-data"
    WriteRegNone HKCU "Software\Classes\.${BLANK_EXT}\OpenWithProgids" "${OTHER_CLASS}"
    WriteRegStr HKCU "Software\Classes\${OTHER_CLASS}" "" "Other editor fixture"
    WriteRegStr HKCU "Software\Classes\${OTHER_CLASS}\shell\open\command" "" '$\"C:\Existing Editor\editor.exe$\" $\"%1$\"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXISTING_EXT}\UserChoice" "ProgId" "${OTHER_CLASS}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXISTING_EXT}\UserChoice" "Hash" "fixture-user-choice-preserved"
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}" "" "preserve-capability-default-value"
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}" "FixtureSentinel" "preserve-capability-data"
    WriteRegStr HKCU "${INKSTONE_CAPABILITIES}\FileAssociations" ".inkstone_fixture_${TEST_TOKEN}_untouched" "${OTHER_CLASS}"
    WriteRegStr HKCU "${INKSTONE_APPLICATION}" "FixtureSentinel" "preserve-application-data"
    WriteRegStr HKCU "${INKSTONE_APPLICATION}\SupportedTypes" ".inkstone_fixture_${TEST_TOKEN}_untouched" ""
    WriteRegStr HKCU "${INKSTONE_APPLICATION}\shell\edit\command" "" "preserve-other-verb"
    !insertmacro registerTestAssociations
    !insertmacro InkstoneRegisterDefaultApps "$appExe"
  ${EndIf}
  done:
SectionEnd
