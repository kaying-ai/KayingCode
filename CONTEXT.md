# KayingCode 插件（Plugins）

插件设置页与安装体验的领域词汇表。本文件统一定义相关术语，供页面、服务和文档使用。

> **产品形态（KayingCode.localrun）**：插件仅 **内置 + 本地安装**。不提供官方在线市场、不拉取远程目录、不按需从 CDN 下载插件包。

## Language

### 来源

**Builtin Plugin（内置插件）**:
随应用包一起分发、启动时播种到本地插件存储的插件。不依赖网络。
_Avoid_: 预装插件、bundled plugin（口语可用，文档统一"内置"）、Official CDN Plugin

**Local Plugin（本地插件）**:
用户从本地目录、本地 `plugin.json` / 清单文件或本地 ZIP 安装的插件。
_Avoid_: CDN 插件、网络插件、商店插件

**Local Marketplace File（本地市场清单）**:
可选的本地 `marketplace.json`，用于批量描述/安装多个本地插件。**仅本地路径**，不支持 URL/git/github。
_Avoid_: Official Marketplace、远程市场

**Local Source Re-snapshot（本地源重读快照）**:
`marketplace update` / 插件「检查更新」对 **本地 file/directory 源**会重新读取源路径并覆盖市场缓存；仍禁止联网拉取。用户 bump 本地源的目录条目 `version` 与插件 `plugin.json` 后，更新检测才能比到新版本。
_Avoid_: Catalog Auto-Refresh、远程目录刷新

**~~CDN Plugin~~ / ~~Official Marketplace 在线目录~~ / ~~Catalog Auto-Refresh~~ / ~~Featured~~**:
**已移除**。KayingCode 不联网拉取插件列表，也不远程控制精选位。

### 插件页结构

**Builtin Segment（内置）**:
插件页分段之一，展示内置插件及其启停/恢复状态。
_Avoid_: 公开 tab、商店 tab

**Local Segment（本地）**:
插件页分段之一，展示本地安装的插件，可从本地路径/ZIP 添加。
_Avoid_: 个人来源市场、第三方商店

**Manage Installed View（管理已安装）**:
保留独立管理视图（启停、卸载、恢复内置）；入口位于插件市场页头并使用明确文字标签。

_Avoid_: 在市场列表中重复展示已安装插件横条；安装与启停状态由插件卡片直接表达。
_Avoid_: 在线更新、检查商店新版本

**Game Development Segment（游戏开发专区）**:
插件市场中的游戏场景汇总入口，在现有通用/个人分段旁展示；只投影带游戏场景元数据的内置插件，不新增安装来源。左侧按游戏引擎筛选，右上按游戏生命周期筛选。开源指完整插件源码公开，必须显式声明 GitHub 仓库；缺少声明不等同闭源。具体规则见 `packages/ui/spec/game-development-plugins.md`。

### 元数据

**Store Listing（展示信息）**:
可选的展示性元数据：显示名、icon、分类、描述。icon **必须为包内/本地资源**，不指向 CDN URL。
_Avoid_: 远程 hero 图、远程 icon

**Plugin Monogram Avatar（插件字母头像）**:
无可用 icon 时的默认头像：展示名首字母/首字 + 黑白灰底（`bg-surface` / `text-foreground`）。同一插件跨列表、详情、@ 提及保持同一字形，避免所有缺图插件共用同一枚 Blocks 图标，也不引入彩色装饰。
_Avoid_: 统一 Blocks 占位、彩色/随机色、仅按分类上色

**Plugin Manifest（插件清单）**:
插件包内 `.kayingcode-plugin/plugin.json`（兼容读取 `.claude-plugin`、`.codex-plugin`）的功能性定义。
_Avoid_: marketplace.json（那是目录，不是清单）

**Official Developer（官方开发者）**:
KayingCode 官方内置插件在 Store Listing 与 Plugin Manifest 中统一使用 `kayingai.com`；详情页优先展示 Listing 作者，缺失 Listing 时回退 Manifest 作者，两条来源不得出现不同品牌。

### 生命周期状态

**Plugin Lifecycle（插件生命周期）**:
发现/选择本地来源 → 校验 → 安装 → 配置 → 启停 → 使用 → 卸载 / 恢复内置。每个阶段都必须同时验证可见 UI 状态和对应的持久化或运行时结果。
_Avoid_: 在线更新、商店购买

**Restorable Builtin（可恢复内置插件）**:
被用户卸载并进入持久化抑制状态的 Builtin Plugin。应用重启不得自动重新播种；可通过「恢复内置」干净恢复。
_Avoid_: 未安装 CDN 插件

**Orphaned Installed Plugin（孤立已安装插件）**:
本地来源路径已失效、但安装目录和用户数据仍保留的插件。仍可使用、配置、启停和卸载。
_Avoid_: 安装损坏、manifest 缺失、已卸载插件

## 本地安装入口（产品要求）

1. **本地目录**：包含 `plugin.json` 或 `.kayingcode-plugin/plugin.json` 的文件夹
2. **本地清单**：单个 `plugin.json` / 本地 `marketplace.json`
3. **本地 ZIP**：打包上述结构的归档
4. **配置挂载**：`plugins.dirs` 指向本地插件根目录

CLI：`kayingcode plugins validate <path>`、`kayingcode plugins install --from <path>`（实施中）。

## 禁止事项（localrun）

- 禁止默认或自动请求 `cdn-*.z.ai` / 任意远程 marketplace.json
- 禁止「添加插件市场（URL/git）」
- 禁止远程 Featured / 目录自动刷新
