!include nsDialogs.nsh
!include FileFunc.nsh

!ifndef KAYINGCODE_INSTALLER_DEFAULT_LOG_PATH
  !define KAYINGCODE_INSTALLER_DEFAULT_LOG_PATH "$TEMP\KayingCode-installer.log"
!endif
!ifndef KAYINGCODE_INSTALLER_ELEVATED_LOG_PATH
  !define KAYINGCODE_INSTALLER_ELEVATED_LOG_PATH "$WINDIR\Logs\KayingCode-installer.log"
!endif
!ifndef KAYINGCODE_INSTALLER_IS_ELEVATED_INNER
  ; 修复原因：来源只在测试夹具模拟内层，正式默认恒假会让提权进程继续使用调用方 /LOG。
  ; 使用 electron-builder 同一 UAC 判据；隔离夹具仍可显式替换，不改变真正的提权流程。
  !include UAC.nsh
  !define KAYINGCODE_INSTALLER_IS_ELEVATED_INNER `${UAC_IsInnerInstance}`
!endif

!ifndef KAYINGCODE_INSTALL_MANIFEST_NAME
  !define KAYINGCODE_INSTALL_MANIFEST_NAME ".kayingcode-install-manifest"
!endif

!ifndef KAYINGCODE_UNINSTALLER_LOG_PATH
  !define KAYINGCODE_UNINSTALLER_LOG_PATH "$TEMP\KayingCode-uninstaller.log"
!endif
!ifndef KAYINGCODE_UNINSTALLER_FUNCTION_PREFIX
  !define KAYINGCODE_UNINSTALLER_FUNCTION_PREFIX "un."
!endif

!ifdef BUILD_UNINSTALLER
  Var KayingCodeUninstallerLogUnavailable

  ; 卸载器只在更新时删除旧文件；单独记录清理阶段，避免外层把权限/空间错误误报成应用仍在运行。
  !macro KayingCodeReportUninstallerStage MESSAGE
    DetailPrint "KayingCode: ${MESSAGE}"
    Push "${MESSAGE}"
    Call ${KAYINGCODE_UNINSTALLER_FUNCTION_PREFIX}KayingCodeWriteUninstallerLog
  !macroend

  Function ${KAYINGCODE_UNINSTALLER_FUNCTION_PREFIX}KayingCodeWriteUninstallerLog
    Exch $R9
    Push $R0
    Push $R1
    Push $R2

    StrCmp $KayingCodeUninstallerLogUnavailable "1" kayingcodeUninstallerLogDone
    ClearErrors
    FileOpen $R1 "${KAYINGCODE_UNINSTALLER_LOG_PATH}" a
    IfErrors kayingcodeUninstallerLogFailed kayingcodeUninstallerLogWrite
    kayingcodeUninstallerLogWrite:
      System::Call "kernel32::GetCurrentProcessId() i.R0"
      FileSeek $R1 0 END
      FileWrite $R1 "[pid=$R0] $R9$\r$\n"
      FileClose $R1
      Goto kayingcodeUninstallerLogDone
    kayingcodeUninstallerLogFailed:
      ; 日志不可写不应改变卸载结果，保留原始清理错误供外层处理。
      StrCpy $KayingCodeUninstallerLogUnavailable "1"
      ClearErrors
    kayingcodeUninstallerLogDone:
      Pop $R2
      Pop $R1
      Pop $R0
      Pop $R9
  FunctionEnd

  !macro customRemoveFilesDiagnosticsStart
    !insertmacro KayingCodeReportUninstallerStage "cleanup-started"
  !macroend

  !macro customRemoveFilesDiagnosticsComplete
    !insertmacro KayingCodeReportUninstallerStage "cleanup-completed"
  !macroend
!endif

!macro customRemoveFiles
  ; Bugfix：electron-builder 默认在更新时递归删除整个 $INSTDIR，用户放入的无关文件也会被清掉。
  ; 只按上一版本随包生成的所有权清单删除，清单缺失时迁移旧版本采用 fail-open 保留策略。
  ${if} ${isUpdated}
    !ifdef BUILD_UNINSTALLER
      !insertmacro customRemoveFilesDiagnosticsStart
    !endif
    ClearErrors
    FileOpen $R0 "$INSTDIR\${KAYINGCODE_INSTALL_MANIFEST_NAME}" r
    IfErrors kayingcodeManifestMissing

    kayingcodeManifestRead:
      ClearErrors
      FileRead $R0 $R1
      IfErrors kayingcodeManifestClose
      ; NSIS FileRead 保留行尾 CRLF；打包清单统一使用换行结尾，先去掉两个行尾字符。
      StrCpy $R1 $R1 -2
      StrCmp $R1 "" kayingcodeManifestRead

      ; 拒绝绝对路径和 .. 前缀，避免损坏或篡改清单越界删除。
      StrCpy $R2 $R1 1
      StrCmp $R2 "\\" kayingcodeManifestRead
      StrCmp $R2 "/" kayingcodeManifestRead
      StrCpy $R2 $R1 2
      StrCmp $R2 ".." kayingcodeManifestRead
      StrCmp $R1 "${UNINSTALL_FILENAME}" kayingcodeManifestRead
      GetFullPathName $R2 "$INSTDIR\$R1"
      StrCmp $R2 "$INSTDIR\$R1" 0 kayingcodeManifestRead

      ; 当前版本卸载器与外层安装器是两个进程；逐项记录到卸载器日志，便于核对真正尝试删除的文件。
      !ifdef BUILD_UNINSTALLER
        !insertmacro KayingCodeReportUninstallerStage "cleanup-file path=$R1"
      !endif
      ClearErrors
      Delete "$INSTDIR\$R1"
      IfErrors kayingcodeManifestDeleteFailed
      Goto kayingcodeManifestRead

    kayingcodeManifestDeleteFailed:
      FileClose $R0
      !ifdef BUILD_UNINSTALLER
        !insertmacro KayingCodeReportUninstallerStage "cleanup-failed reason=permission-or-disk-space"
      !endif
      Abort "无法删除旧版本文件：$INSTDIR\$R1"

    kayingcodeManifestClose:
      FileClose $R0
      Goto kayingcodeManifestDone

    kayingcodeManifestMissing:
      ; 首次从旧版本升级时没有清单，不能猜测所有权并删除用户文件。
      !ifdef BUILD_UNINSTALLER
        !insertmacro KayingCodeReportUninstallerStage "cleanup-skipped reason=manifest-missing action=preserve"
      !endif
      ClearErrors

    kayingcodeManifestDone:
      !ifdef BUILD_UNINSTALLER
        !insertmacro customRemoveFilesDiagnosticsComplete
      !endif
  ${else}
    ; 普通卸载仍保持 electron-builder 的全量删除语义；ownership 清单只约束覆盖更新。
    SetOutPath $TEMP
    RMDir /r $INSTDIR
  ${endIf}
!macroend

!ifndef BUILD_UNINSTALLER
  Var KayingCodeInstallerLogPath
  Var KayingCodeInstallerLogUnavailable
  Var KayingCodeInstallerProcessRole
  Var KayingCodeUninstallerDetailsUnavailable
  Var KayingCodePreviousUninstallerSupportsManifest

  ; 详情面板和文件日志共用同一条阶段事件，避免静默安装丢失关键上下文。
  !macro KayingCodeReportInstallerStage MESSAGE
    SetDetailsPrint listonly
    DetailPrint "KayingCode: ${MESSAGE}"
    Push "${MESSAGE}"
    Call KayingCodeWriteInstallerLog
  !macroend

  Function KayingCodeWriteInstallerLog
    Exch $R9
    Push $R0
    Push $R1
    Push $R2

    StrCmp $KayingCodeInstallerLogPath "" kayingcodeInstallerLogDone
    StrCmp $KayingCodeInstallerLogUnavailable "1" kayingcodeInstallerLogDone
    StrCpy $R2 0
    kayingcodeInstallerLogOpen:
      ClearErrors
      FileOpen $R1 $KayingCodeInstallerLogPath a
      IfErrors kayingcodeInstallerLogRetry kayingcodeInstallerLogWrite
    kayingcodeInstallerLogRetry:
      IntOp $R2 $R2 + 1
      IntCmp $R2 3 kayingcodeInstallerLogFailed kayingcodeInstallerLogWait kayingcodeInstallerLogFailed
    kayingcodeInstallerLogWait:
      Sleep 50
      Goto kayingcodeInstallerLogOpen
    kayingcodeInstallerLogWrite:
      System::Call "kernel32::GetCurrentProcessId() i.R0"
      FileSeek $R1 0 END
      FileWrite $R1 "[pid=$R0] $R9$\r$\n"
      FileClose $R1
      Goto kayingcodeInstallerLogDone
    kayingcodeInstallerLogFailed:
      StrCpy $KayingCodeInstallerLogUnavailable "1"
      ClearErrors
    kayingcodeInstallerLogDone:
      Pop $R2
      Pop $R1
      Pop $R0
      Pop $R9
  FunctionEnd

  Function KayingCodeResetUninstallerLog
    StrCpy $KayingCodeUninstallerDetailsUnavailable ""
    ClearErrors
    FileOpen $R0 "${KAYINGCODE_UNINSTALLER_LOG_PATH}" w
    IfErrors kayingcodeUninstallerDetailsResetFailed kayingcodeUninstallerDetailsResetSucceeded
    kayingcodeUninstallerDetailsResetSucceeded:
      FileClose $R0
      Goto kayingcodeUninstallerDetailsResetDone
    kayingcodeUninstallerDetailsResetFailed:
      ; 外层详情不能读取旧卸载器日志时仍继续安装，文件日志和退出码仍是最终依据。
      StrCpy $KayingCodeUninstallerDetailsUnavailable "1"
      ClearErrors
    kayingcodeUninstallerDetailsResetDone:
  FunctionEnd

  Function KayingCodeShowUninstallerCleanupDetails
    Push $R0
    Push $R1
    Push $R2

    StrCmp $KayingCodeUninstallerDetailsUnavailable "1" kayingcodeShowUninstallerDetailsDone
    ClearErrors
    FileOpen $R0 "${KAYINGCODE_UNINSTALLER_LOG_PATH}" r
    IfErrors kayingcodeShowUninstallerDetailsDone
    kayingcodeShowUninstallerDetailsRead:
      ClearErrors
      FileRead $R0 $R1
      IfErrors kayingcodeShowUninstallerDetailsClose
      StrCmp $R1 "" kayingcodeShowUninstallerDetailsRead
      SetDetailsPrint listonly
      DetailPrint "KayingCode: cleanup-log $R1"
      Goto kayingcodeShowUninstallerDetailsRead
    kayingcodeShowUninstallerDetailsClose:
      FileClose $R0
    kayingcodeShowUninstallerDetailsDone:
      Pop $R2
      Pop $R1
      Pop $R0
  FunctionEnd

  !macro preInit
    Call KayingCodeInitializeInstallerLog
  !macroend

  !macro customInit
    IfSilent kayingcodeInstallerInitSilent kayingcodeInstallerInitInteractive
    kayingcodeInstallerInitSilent:
      !insertmacro KayingCodeReportInstallerStage "installer-initialized mode=silent"
      Goto kayingcodeInstallerInitDone
    kayingcodeInstallerInitInteractive:
      !insertmacro KayingCodeReportInstallerStage "installer-initialized mode=interactive"
    kayingcodeInstallerInitDone:

    ; 品牌迁移（KayingCodex → KayingCode）：appId 复用使 APP_GUID 注册表键被继承，
    ; multiUser.nsh 的 setInstallModePerAllUsers 会直接沿用旧 InstallLocation，
    ; 让升级安装默认进入旧品牌目录（如 C:\Program Files\KayingCodex）。
    ; 这里在 initMultiUser 之后、目录页之前改写默认目录：仅当目录末段仍是旧品牌名
    ; KayingCodex 时按 electron-builder 默认布局重置；用户自选目录、已迁移目录与
    ; per-user 默认目录（...\Programs\KayingCode）末段都不是旧品牌名，不会命中。
    Push $R0
    ${GetFileName} $INSTDIR $R0
    ${If} $R0 == "KayingCodex"
      ${If} ${RunningX64}
        StrCpy $INSTDIR "$PROGRAMFILES64\${APP_FILENAME}"
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${APP_FILENAME}"
      ${EndIf}
      !insertmacro KayingCodeReportInstallerStage "install-dir-migrated legacy=$R0 target=$INSTDIR"
    ${EndIf}
    Pop $R0
  !macroend

  ; 这些宏由打包时的 electron-builder installSection.nsh 补丁按安装顺序调用。
  ; 只有阶段 marker 写入详情和日志，解压文件明细由 NSIS 的 File 命令在 listonly 模式输出。
  !macro customInstallSectionStarted
    !insertmacro KayingCodeReportInstallerStage "install-started"
  !macroend

  !macro customInstallCleanupStarted
    Call KayingCodeResetUninstallerLog
    !insertmacro KayingCodeReportInstallerStage "cleanup-started"
  !macroend

  !macro customInstallCleanupCompleted
    !insertmacro KayingCodeReportInstallerStage "cleanup-completed"
    Call KayingCodeShowUninstallerCleanupDetails
  !macroend

  !macro customInstallExtractStarted
    !insertmacro KayingCodeReportInstallerStage "extract-started"
  !macroend

  !macro customInstallExtractCompleted
    !insertmacro KayingCodeReportInstallerStage "extract-completed"
  !macroend

  !macro customInstallShortcutsStarted
    !insertmacro KayingCodeReportInstallerStage "shortcuts-started"
  !macroend

  !macro customInstallShortcutsCompleted
    !insertmacro KayingCodeReportInstallerStage "shortcuts-completed"
  !macroend

  Function KayingCodeDetectPreviousUninstallerCapabilities
    StrCpy $KayingCodePreviousUninstallerSupportsManifest "0"
    ; manifest 是卸载器能力标记：存在即表示旧卸载器会按清单选择性删除。
    IfFileExists "$INSTDIR\${KAYINGCODE_INSTALL_MANIFEST_NAME}" 0 kayingcodePreviousUninstallerCapabilityCheckNested
      StrCpy $KayingCodePreviousUninstallerSupportsManifest "1"
      Return

    kayingcodePreviousUninstallerCapabilityCheckNested:
      ; assisted installer 的目录页会在后续 instfilesPre 才补上 APP_FILENAME 子目录，提前兼容两种形态。
      IfFileExists "$INSTDIR\${APP_FILENAME}\${KAYINGCODE_INSTALL_MANIFEST_NAME}" 0 kayingcodePreviousUninstallerCapabilityDone
        StrCpy $KayingCodePreviousUninstallerSupportsManifest "1"

    kayingcodePreviousUninstallerCapabilityDone:
  FunctionEnd

  !macro customUnInstallCheck
    ; handleUninstallResult 会把旧卸载器的退出码放在 $R0；失败时显示清理诊断，
    ; 不再复用 appCannotBeClosed（该文案只适用于进程占用）。
    ${if} $R0 != 0
      ; 修复原因：静默自动更新无人值守，未设置 /SD 的模态框会一直等待用户点击，
      ; 使明确的退出码无法返回 electron-updater。静默时自动采用 IDOK，交互时仍显示提示。
      SetDetailsPrint listonly
      DetailPrint "KayingCode: cleanup-failed exit-code=$R0"
      Call KayingCodeShowUninstallerCleanupDetails
      MessageBox MB_OK|MB_ICONSTOP "旧版本清理失败（错误码 $R0）。可能是文件被占用、权限不足或磁盘空间不足。详细日志：${KAYINGCODE_UNINSTALLER_LOG_PATH}" /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
  !macroend

  !macro customUnInstallCheckCurrentUser
    ; per-machine 安装切换到 HKCU 旧版本时，electron-builder 会走另一条 hook；
    ; 复用同一诊断，避免同一个清理失败因注册表根键不同又退回默认文案。
    !insertmacro customUnInstallCheck
  !macroend
!endif

!define KAYINGCODE_INSTALL_DIR_BACK_BUTTON_WIDTH 180

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; 修复原因：异步生成的 header 可能先 include 本文件，再注册 UAC 插件目录。
    ; 在 customHeader 展开函数，确保插件已注册；preInit 仍调用同一函数和真实 UAC 判据。
    Function KayingCodeInitializeInstallerLog
      Push $R0
      Push $R1
      Push $R2
      StrCpy $KayingCodeInstallerLogUnavailable ""
      ${If} ${KAYINGCODE_INSTALLER_IS_ELEVATED_INNER}
        StrCpy $KayingCodeInstallerProcessRole "elevated-inner"
        StrCpy $KayingCodeInstallerLogPath "${KAYINGCODE_INSTALLER_ELEVATED_LOG_PATH}"
      ${Else}
        StrCpy $KayingCodeInstallerProcessRole "outer"
        StrCpy $R0 $CMDLINE
        ClearErrors
        ${GetOptions} $R0 "/LOG=" $R1
        IfErrors kayingcodeInstallerLogUseDefault
        StrCmp $R1 "" kayingcodeInstallerLogUseDefault
        StrCpy $KayingCodeInstallerLogPath $R1
        Goto kayingcodeInstallerLogPathReady
        kayingcodeInstallerLogUseDefault:
          StrCpy $KayingCodeInstallerLogPath "${KAYINGCODE_INSTALLER_DEFAULT_LOG_PATH}"
        kayingcodeInstallerLogPathReady:
          ${GetParent} $KayingCodeInstallerLogPath $R2
          StrCmp $R2 "" kayingcodeInstallerLogInitialized
          CreateDirectory "$R2"
      ${EndIf}
      kayingcodeInstallerLogInitialized:
        !insertmacro KayingCodeReportInstallerStage "installer-process-started role=$KayingCodeInstallerProcessRole"
      Pop $R2
      Pop $R1
      Pop $R0
    FunctionEnd

    ; 修复原因：electron-builder 的 common.nsh 先设置 ShowInstDetails nevershow；
    ; hide 在该模板组合下仍可能留下空白列表且没有可展开入口，因此直接常显阶段详情。
    ShowInstDetails show
    !ifdef allowToChangeInstallationDirectory
      ; 修复原因：electron-builder 已在 assistedInstaller.nsh 中用该开关生成安装目录页面，
      ; 但 installUtil.nsh 随后还会用它禁止无 --updated 的手动覆盖保留快捷方式，导致旧卸载器
      ; 调用 UninstShortcut 注销开始菜单固定项。页面生成后撤掉开关，让自动更新和手动覆盖
      ; 在同一安装目录覆盖时都通过 KeepShortcuts 保留同一个 .lnk。
      !undef allowToChangeInstallationDirectory
    !endif
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  ; 修复原因：electron-builder 会先编译卸载器，但快捷方式目标读取只在安装更新流程中调用。
  ; 若把函数带入卸载器，NSIS 会产生 6010 未引用告警，并在 /WX 下直接中断 Windows CI。
  Function KayingCodeReadShortcutTarget
    Exch $R9
    Push $R1
    Push $R2

    StrCpy $R2 ""
    System::Call 'Kernel32::SetEnvironmentVariableW(w "KAYINGCODE_SHORTCUT_PATH", w "$R9") i.R1'
    StrCmp $R1 "0" kayingcodeReadShortcutTargetDone 0

    nsExec::ExecToStack /TIMEOUT=5000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "[Console]::Out.Write(([Activator]::CreateInstance([type]::GetTypeFromProgID('WScript.Shell'))).CreateShortcut([Environment]::GetEnvironmentVariable('KAYINGCODE_SHORTCUT_PATH')).TargetPath)"`
    Pop $R1
    Pop $R2
    StrCmp $R1 "0" kayingcodeReadShortcutTargetDone 0
    StrCpy $R2 ""

    kayingcodeReadShortcutTargetDone:
      System::Call 'Kernel32::SetEnvironmentVariableW(w "KAYINGCODE_SHORTCUT_PATH", p 0) i.R1'
      StrCpy $R9 "$R2"
      Pop $R2
      Pop $R1
      Exch $R9
  FunctionEnd
!endif

!macro KayingCodeRepairShortcutIfNeeded SHORTCUT_PATH LABEL_PREFIX
  ${if} ${FileExists} "${SHORTCUT_PATH}"
    Push "${SHORTCUT_PATH}"
    Call KayingCodeReadShortcutTarget
    Pop $R0
    StrCmp $R0 "$appExe" ${LABEL_PREFIX}Done 0

    ; 修复原因：历史版本可能留下指向已移动 exe 的 .lnk，但无条件覆盖正确快捷方式会让
    ; 部分 Windows 11 丢失“所有应用”索引或用户固定关系，因此只修复目标不一致的项。
    ClearErrors
    CreateShortCut "${SHORTCUT_PATH}" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    IfErrors ${LABEL_PREFIX}Failed ${LABEL_PREFIX}Succeeded
    ${LABEL_PREFIX}Failed:
      DetailPrint "Unable to repair shortcut: ${SHORTCUT_PATH}"
      ClearErrors
      Goto ${LABEL_PREFIX}Done
    ${LABEL_PREFIX}Succeeded:
      WinShell::SetLnkAUMI "${SHORTCUT_PATH}" "${APP_ID}"
      ; 修复后的 .lnk 必须在最后一次写入后通知 Shell，避免开始菜单继续使用旧索引。
      System::Call 'Shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "${SHORTCUT_PATH}", p 0)'
    ${LABEL_PREFIX}Done:
  ${endIf}
!macroend

!macro customInstall
  !ifndef BUILD_UNINSTALLER
    !insertmacro KayingCodeReportInstallerStage "install-finalization-started"
  !endif
  ${if} ${isUpdated}
  ${orIf} $keepShortcuts == "true"
    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      !insertmacro KayingCodeRepairShortcutIfNeeded "$newStartMenuLink" kayingcodeStartMenuShortcutRepair
    !endif

    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      !insertmacro KayingCodeRepairShortcutIfNeeded "$newDesktopLink" kayingcodeDesktopShortcutRepair
    !endif
  ${endIf}

  ; 修复原因：手动覆盖没有 --updated，继承旧快捷方式时仍需检查目标；首次安装没有旧项，
  ; 不应额外启动 PowerShell。用户已删除的快捷方式也不会重建。
  ; assisted installer 完成页始终直接运行本次安装落盘的 exe。
  StrCpy $launchLink "$appExe"

  !ifndef BUILD_UNINSTALLER
    ; Win11 任务栏对设置了 AUMID 的窗口，只按开始菜单索引中匹配该 AUMID 的快捷方式
    ; 解析任务栏图标；electron-builder 模板创建 .lnk 时不写 AUMID，首次安装与
    ; 原地升级（目标未变、走不到上面的修复分支）都会让运行中的窗口显示通用图标。
    ; 这里对本次安装的两个 .lnk 无条件补写 APP_ID 并通知 Shell 重新索引，
    ; 与修复分支（KayingCodeRepairShortcutIfNeeded）的行为保持一致。
    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      ${if} ${FileExists} "$newStartMenuLink"
        WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
        System::Call 'Shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$newStartMenuLink", p 0)'
      ${endIf}
    !endif
    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      ${if} ${FileExists} "$newDesktopLink"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        System::Call 'Shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$newDesktopLink", p 0)'
      ${endIf}
    !endif

    ; per-machine 安装时，用户级开始菜单/桌面可能残留同名旧 .lnk（历史 per-user
    ; 安装或旧品牌迁移留下）：它们与全局 .lnk 同 AUMID 却指向已卸载目录，
    ; 开始菜单索引命中坏副本时任务栏会解析到通用图标。切到用户上下文修复
    ; 目标后还原上下文；修复宏内部只在目标不一致时重写并补写 AUMID。
    ${if} $installMode == "all"
      SetShellVarContext current
      !insertmacro KayingCodeRepairShortcutIfNeeded "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" kayingcodeUserStartMenuShortcutRepair
      !insertmacro KayingCodeRepairShortcutIfNeeded "$DESKTOP\${PRODUCT_FILENAME}.lnk" kayingcodeUserDesktopShortcutRepair
      SetShellVarContext all
    ${endIf}
  !endif
  !ifndef BUILD_UNINSTALLER
    !insertmacro KayingCodeReportInstallerStage "install-completed"
  !endif
!macroend

!macro customPageAfterChangeDir
  Function KayingCodeResizeInstallDirBackButton
    GetDlgItem $1 $HWNDPARENT 3
    StrCmp $1 0 kayingcodeResizeInstallDirBackButtonDone 0

    System::Call "*(i 0, i 0, i 0, i 0) p.r2"
    StrCmp $2 0 kayingcodeResizeInstallDirBackButtonDone 0
    System::Call "user32::GetWindowRect(p r1, p r2)"
    System::Call "user32::MapWindowPoints(p 0, p $HWNDPARENT, p r2, i 2)"
    System::Call "*$2(i.r3,i.r4,i.r5,i.r6)"
    System::Free $2

    IntOp $7 $5 - $3
    IntOp $8 $6 - $4
    IntCmp $7 ${KAYINGCODE_INSTALL_DIR_BACK_BUTTON_WIDTH} kayingcodeResizeInstallDirBackButtonDone kayingcodeResizeInstallDirBackButtonResize kayingcodeResizeInstallDirBackButtonDone

    kayingcodeResizeInstallDirBackButtonResize:
      ; 修复原因：阻断页把“上一步”改成中文动作文案，NSIS 默认按钮宽度可能裁掉文字。
      ; 保持右边缘不动向左扩宽，避免和右侧“安装/取消”按钮重叠。
      IntOp $3 $5 - ${KAYINGCODE_INSTALL_DIR_BACK_BUTTON_WIDTH}
      System::Call "user32::MoveWindow(p r1, i r3, i r4, i ${KAYINGCODE_INSTALL_DIR_BACK_BUTTON_WIDTH}, i r8, i 1)"

    kayingcodeResizeInstallDirBackButtonDone:
  FunctionEnd

  Function KayingCodeFindNestedDataDir
    Exch $R9
    Push $0
    Push $1

    StrCpy $R2 ""

    IfFileExists "$R9\.kayingcode\*.*" 0 +2
      StrCpy $R2 "$R9\.kayingcode"
    StrCmp $R2 "" 0 kayingcodeFindNestedDataDirDone
    IfFileExists "$R9\.kayingcode" 0 kayingcodeFindNestedDataDirListChildren
      StrCpy $R2 "$R9\.kayingcode"
    StrCmp $R2 "" 0 kayingcodeFindNestedDataDirDone

    kayingcodeFindNestedDataDirListChildren:
      FindFirst $0 $1 "$R9\*"
      IfErrors kayingcodeFindNestedDataDirDone

    kayingcodeFindNestedDataDirNext:
      StrCmp $1 "" kayingcodeFindNestedDataDirClose
      StrCmp $1 "." kayingcodeFindNestedDataDirContinue
      StrCmp $1 ".." kayingcodeFindNestedDataDirContinue
      IfFileExists "$R9\$1\*.*" 0 kayingcodeFindNestedDataDirContinue
        Push "$R9\$1"
        Call KayingCodeFindNestedDataDir
        StrCmp $R2 "" kayingcodeFindNestedDataDirContinue kayingcodeFindNestedDataDirClose

    kayingcodeFindNestedDataDirContinue:
      FindNext $0 $1
      IfErrors kayingcodeFindNestedDataDirClose
      Goto kayingcodeFindNestedDataDirNext

    kayingcodeFindNestedDataDirClose:
      FindClose $0

    kayingcodeFindNestedDataDirDone:
      Pop $1
      Pop $0
      Pop $R9
  FunctionEnd

  Function KayingCodeBlockInstallDirContainsData
    Call KayingCodeDetectPreviousUninstallerCapabilities
    StrCmp $KayingCodePreviousUninstallerSupportsManifest "1" kayingcodeInstallDirDataBlockSkip

    ; Bugfix: 用户可能把数据存储目录放进安装目录，Windows 更新覆盖安装目录时会清掉 .kayingcode。
    ; assisted installer 会把不含应用名的选择目录补成 "$INSTDIR\${APP_FILENAME}"，所以这里按相同规则计算最终安装目录。
    ${StrContains} $R1 "${APP_FILENAME}" "$INSTDIR"
    StrCmp $R1 "" 0 kayingcodeInstallDirDataBlockUseSelectedDir
    StrCpy $R0 "$INSTDIR\${APP_FILENAME}"
    Goto kayingcodeInstallDirDataBlockCheckDir

    kayingcodeInstallDirDataBlockUseSelectedDir:
      StrCpy $R0 "$INSTDIR"

    kayingcodeInstallDirDataBlockCheckDir:
      ; 修复原因：旧阻断只检查最终安装目录直属的 .kayingcode，漏掉 data\.kayingcode 等子目录数据。
      ; 安装器覆盖安装时会管理整个安装目录树，递归命中任意 .kayingcode 都必须阻断。
      Push "$R0"
      Call KayingCodeFindNestedDataDir
      StrCmp $R2 "" kayingcodeInstallDirDataBlockSkip kayingcodeInstallDirDataBlockFound

    kayingcodeInstallDirDataBlockFound:
      IfSilent kayingcodeInstallDirDataBlockSilent

      !insertmacro MUI_HEADER_TEXT "需要修改安装目录" "当前安装目录或其子目录包含 KayingCode 数据目录"
      nsDialogs::Create 1018
      Pop $0
      StrCmp $0 error kayingcodeInstallDirDataBlockDialogFailed 0

      ${NSD_CreateLabel} 0u 0u 300u 44u "检测到该安装目录或其子目录中存在 .kayingcode 数据目录：$\r$\n$R2"
      Pop $1
      ${NSD_CreateLabel} 0u 54u 300u 70u "为避免历史会话和配置被安装器清理，请返回上一步选择其他安装目录。$\r$\n$\r$\n当前目录不能继续安装。"
      Pop $1

      GetDlgItem $1 $HWNDPARENT 1
      EnableWindow $1 0
      GetDlgItem $1 $HWNDPARENT 3
      EnableWindow $1 1
      SendMessage $1 ${WM_SETTEXT} 0 "STR:重选目录"
      Call KayingCodeResizeInstallDirBackButton

      nsDialogs::Show
      Return

    kayingcodeInstallDirDataBlockDialogFailed:
      MessageBox MB_OK|MB_ICONSTOP "检测到安装目录或其子目录中存在 .kayingcode 数据目录，安装已停止。请重新运行安装器并选择其他安装目录。"
      SetErrorLevel 1
      Quit

    kayingcodeInstallDirDataBlockSilent:
      SetErrorLevel 1
      Quit

    kayingcodeInstallDirDataBlockSkip:
      Abort
  FunctionEnd

  Function KayingCodeBlockInstallDirContainsDataLeave
    ; 修复原因：阻断页的下一步按钮已禁用，但自动化或系统快捷键仍可能触发下一页。
    ; leave 回调只处理继续前进的路径，这里强制留在当前页，确保用户只能返回修改安装目录。
    Abort
  FunctionEnd

  Page custom KayingCodeBlockInstallDirContainsData KayingCodeBlockInstallDirContainsDataLeave
!macroend
