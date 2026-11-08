# 设备管理面板 Electron E2E（2026-11-01）

## 1. 目标

验证设置页 `remoteDevices` 面板本身的生产交互，而不是连接向导或安装链路：

1. 面板能列出已保存的远端设备与连接线路；
2. 断开状态点击 **Connect** 后进入在线状态；
3. 在线状态点击 **Disconnect** 后回到离线状态；
4. **编辑**连接名与设备名后，面板立即显示新名称；
5. 通过更多菜单 **Remove device** 确认后，设备和本地记录从面板消失。

## 2. 真实 UI 路径

脚本点击/等待的都是生产组件：

- 侧栏 `task-settings-button` → 设置页；
- `settings-section-nav-remoteDevices` → 远程设备面板；
- `[data-source-server-card="<sourceServerId>"]` 内的 Connect / Disconnect / Edit / More →
  Remove device，以及编辑对话框的 `#edit-connection-name`、`#edit-device-name` 和
  **Save changes**。

## 3. 测试注入（不属于产品路径）

1. **种子设备**：通过 preload 暴露的真实 IPC `connectRemote({kind:"wsl", distro})` +
   `bindRemoteWorkspaceSessionContext` 建立已保存的 WSL profile/source，然后
   `disposeRemoteSession` 让面板从离线状态开始。连接向导与面板使用同一条 Host 链路，
   但脚本不点击向导。
2. **Agent bundle**：把已构建的 `kayingcode.cjs` 复制到隔离 data dir 的
   `.kayingcode/server/agents/glm/`，满足 Host storage-preparation 前置要求，不写入仓库。
3. **隔离目录**：HOME、user-data、session-data、dataBaseDir 都指向临时目录，不污染真实设置。

## 4. 前置

- `pnpm --filter @zcode/desktop run build:no-runtime-assets`
- `pnpm --filter @zcode/server-cli stage:remote-assets --linux`（需要重新安装时使用）
- 可用 Agent bundle（`KAYINGCODE_E2E_AGENT_BUNDLE` 或仓库内已构建产物）
- 本机 WSL 与目标发行版；已安装 Source Server（或设置 `KAYINGCODE_E2E_WSL_RESET=1`
  先清理并重新安装）

## 5. 命令

```bash
pnpm --filter @zcode/desktop run smoke:device-panel
# 首次安装路径：
KAYINGCODE_E2E_WSL_RESET=1 pnpm --filter @zcode/desktop run smoke:device-panel
# 排查时保留隔离目录：
KAYINGCODE_E2E_KEEP_TEMP=1 pnpm --filter @zcode/desktop run smoke:device-panel
```

## 6. 断言与失败语义

- 设备卡片必须出现，且包含 WSL 发行版地址；
- 状态按钮必须从 Connect → Disconnect → Connect 正确切换；超时即失败，不用固定等待掩盖；
- 编辑保存后，设备名与连接名必须同时更新；
- 移除确认后卡片必须 detach，并出现空状态文案；
- 任一步失败输出当前阶段和页面错误，退出码非 0。

## 7. 不在本批范围

- **更新/升级**：需要版本清单与可控的 `updateAvailability` 场景，留待 mock manifest 或
  Manager 层测试；
- “在侧边栏显示 / 打开设备上的项目”属于 P1 交互，本批不做；
- SSH/Docker 真实凭据与目标。

## 8. 验收

| 命令                                                                       | 期望                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm --filter @zcode/desktop run smoke:device-panel`                      | PASS：device card → Connect → Disconnect → Edit → Remove |
| `pnpm --filter @zcode/desktop run typecheck`                               | 通过                                                     |
| `pnpm run lint` / `pnpm run source:check` / `architecture:check --changed` | 无新增错误                                               |
