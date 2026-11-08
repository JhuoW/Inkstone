!ifndef INKSTONE_INSTALLER_LANGUAGE
!define INKSTONE_INSTALLER_LANGUAGE

; UI language is independent of regional formats and keyboard layouts.
; All Chinese UI variants use our available Simplified Chinese translation.
!macro InkstoneNormalizeUILanguage INPUT OUTPUT
  IntOp ${OUTPUT} ${INPUT} & 0x3ff
  ${If} ${OUTPUT} == 4
    StrCpy ${OUTPUT} 2052
  ${Else}
    StrCpy ${OUTPUT} 1033
  ${EndIf}
!macroend

; Pure policy shared with the silent native fixture. Only an interactive outer
; installer chooses; its elevated child inherits the exact selected language.
!macro InkstoneLanguagePolicy UI_LANGUAGE INNER PARENT_LANGUAGE SILENT SHOW
  !insertmacro InkstoneNormalizeUILanguage ${UI_LANGUAGE} $LANGUAGE
  StrCpy ${SHOW} 0
  ${If} ${INNER} == 1
    ${If} ${PARENT_LANGUAGE} == 1033
    ${OrIf} ${PARENT_LANGUAGE} == 2052
      StrCpy $LANGUAGE ${PARENT_LANGUAGE}
    ${EndIf}
  ${ElseIf} ${SILENT} != 1
    StrCpy ${SHOW} 1
  ${EndIf}
!macroend

!endif
