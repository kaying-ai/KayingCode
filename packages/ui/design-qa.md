# 游戏开发插件专区视觉与交互验收

final result: passed

## 对照与范围

- Source visual truth：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/codex-clipboard-d1ffb7f0-a475-4d57-acaa-e9a00d27012b.png`，1053 × 793 px。
- 产品变更依据：`spec/game-development-plugins.md`。原图是公开列表；新增专区采用用户指定的引擎侧栏、右上生命周期、中央卡片结构，因此新增区域不做旧列表的像素复刻。
- Implementation：真实 `PluginStoreListView` + 官方发行清单的验证页面，`http://127.0.0.1:5187/?segment=game-development`。此页面隔离展示市场内容，不模拟 Electron 窗口、应用侧栏与页头操作。完整桌面进程未启动，本轮不声明完成整机运行时回归。
- 截图目录：`/Users/feng/.codex/visualizations/2026/10/23/01a166ef-a590-7043-9e06-068de67b9047/game-development-plugins/`。
- 桌面实现：`desktop-dark.png`、`desktop-light.png`，1053 × 793 CSS px / 图片 px，deviceScaleFactor = 1；无需密度归一化。移动实现 `mobile-light.png`，390 × 844 CSS px / 图片 px。
- 状态：游戏开发、全部引擎、全部阶段、无搜索。真实三个条目源码状态均未确认，不把上游 MIT 许可证或仓库误当完整插件开源声明。

## 对照证据与结果

- 原图与最终桌面截图在同一视觉输入中联合检查：保留黑灰主题、搜索框、胶囊分段、40px 插件头像、文本层级与启停操作；新增游戏分段不修改应用导航结构。
- 重点区域联合检查 `source-groups-example.png`：只在验证环境加入明确标注的示例数据，开源/闭源分组清晰，右上 GitHub banner 有独立焦点与点击区域，不遮挡标题或启停控件。示例不进入发行清单。
- 字体：使用仓库字体和 `text-ui-*` 标度，没有新增任意字号。颜色：使用现有背景、卡片、边框、选中态与语义状态 token。图像：复用 `PluginStoreAvatar` 的本地图标/单色字母头像与现有图标库。
- 布局：左侧 132px 引擎栏、右上生命周期、按内容容器宽度切换单双列卡片；390px 下筛选换行、控件纵向排列，卡片操作不溢出。640px 中间断点也验证无横向溢出。
- 文案：中文/英文与明暗主题均检查；没有新增网络安装、虚构引擎插件或未经确认的源码声明。
- 无未解决的 P0/P1/P2 问题。

## 修正记录

1. 首次截图的验证页继承桌面透明背景，暗色文本落在白底上（P1，验证环境问题）。修正 fixture 背景并恢复独立页面滚动；正式应用主题未改动。
2. 长页面整页截图在滚动/过渡中产生拼接残影。改为瞬时回到顶部、禁用截图时过渡、固定视口截图。最终桌面/手机截图已与原图联合复核，残影消除。
3. 无 banner 的卡片移除预留顶部空白。游戏卡片拆出独立组件并复用现有操作控件，普通列表只补充键盘事件隔离。

## 实际验证

- 游戏专区 E2E：三种源码分组、GitHub 点击/Enter、启停点击/Space、卡片 Enter、恢复、详情返回保留筛选、分段切换、搜索交集、清空、无结果和加载态。
- 2 种语言 × 2 种主题 × 3 种宽度（1053 / 640 / 390）；无横向溢出，`pageerror` 为空。
- 原有 `pluginStoreEnablement.e2e.mjs` 回归通过。
- 在 Codex 内置浏览器中打开真实列表组件预览并检查选中态与布局。

## 后续内容维护

首批 TapTap Maker、Blender、游戏试玩助理的完整插件源码公开状态待登记。已明确开源时在唯一发行清单补 `source.kind` 与完整 GitHub 仓库地址；闭源时显式声明 `closed-source`。当前不凭空归类。

## 架构与检查结果

- 变更模块：`ui`、`shared`、`agent-contracts`、`agent-adapters`，以及唯一官方发行清单。
- 状态所有者：`PluginStorePage` 持有筛选；`pluginManagementStore` 持有安装/启停事实。事件顺序与状态图见产品 spec；没有新队列、持久化、网络请求或重放语义。
- `bun run typecheck` 通过；额外执行 Agent contracts 构建与 agent-adapters 类型检查，均通过。
- `bun run lint`：0 错误、129 条既有警告；本次涉及的实现文件定向检查为 0 警告、0 错误。
- 10 项单测、游戏专区 E2E 与原启停 E2E 均通过；改动文件格式检查、`git diff --check`、`source:check` 均通过。
- `architecture:check --changed`：baseline 0、new 0、violations 0。

## 横向生命周期与 TapTap制造追加验收

- 本轮标注图：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/codex-clipboard-c3b134c6-0137-4cbf-b797-48a48995cec4.png`（1907 × 1280 图片 px；包含桌面外壳，不做整图像素对齐）。
- 与最新 `desktop-dark.png` 和 `mobile-light.png` 在同一视觉输入中对照：生命周期全部阶段及六个分类横向平铺；宽屏位于内容右上方，窄屏自然换行，未新增下拉菜单。
- 新增引擎「TapTap制造」，稳定标识 `taptap-maker`；发行清单中 TapTap Maker 同时声明 `taptap-maker` 与 `threejs`。与生命周期、搜索、通用能力组合筛选正确。
- E2E 验证全部七个阶段按钮可见、无 select、TapTap制造 + 游戏发布准确命中 TapTap Maker，并覆盖七种引擎和原先的启停/恢复/详情行为。
- 状态所有者和事件顺序保持原 spec：Page 持有筛选，安装/启停仍使用原 store；无传输语义变更。涉及模块仍为 ui/shared 及发行清单生成投影。
- 视觉结论：无新增 P0/P1/P2；final result: passed。

## 顶部合并横栏追加验收

- 标注来源：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/codex-clipboard-181740c7-64bd-44ed-9398-b64f0a68ed15.png`。与最新桌面、手机截图同输入对照，按本轮标注压缩顶部布局。
- 移除可见「生命周期」文字与前缀图标；标题、内置插件标记、全部阶段与六种阶段合并成紧凑横栏。原简介保留为辅助技术文本，不占可见行高；筛选组保留无障碍名称。
- 1053px 中文 E2E 直接检查标题和全部按钮的垂直中心位于同一行，并检查阶段组不存在前缀文本/图标；原筛选、TapTap制造、启停、恢复与详情测试通过。
- 中英文 × 明暗主题 × 1053/640/390px 视口检查无横向溢出，所有阶段可见，手机按可用宽度换行。最新证据：`desktop-compact-toolbar.png`、`mobile-light.png`，目录同上。
- 本轮仅调整 ui 模块布局与对应规范/E2E，状态所有者、接口与事件顺序不变。视觉 final result: passed。

## 移除冗余标题追加验收

- 本轮标注图：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/codex-clipboard-d04ce154-d28d-43fd-b7ab-e6a225829550.png`；与最新 `desktop-clean-labels.png` 同输入对照，移除「游戏引擎」可见标题和「源码信息待补充」标题行及分组数量。
- 引擎筛选组仍有无障碍名称；未声明源码状态的卡片继续展示，明确开源/闭源的分组标题保留。数据分类、计数来源、状态所有者和事件顺序不变，本轮仅调整 ui 呈现。
- E2E 增加两处标题与未知分组 heading 缺失断言，同时保留 3 张未声明源码状态卡片断言；原筛选、启停、恢复、详情、中英文、明暗主题与手机无溢出验证通过。
- 最新截图同目录 `desktop-clean-labels.png`、`mobile-light.png`；无新增 P0/P1/P2，final result: passed。

## 通用名称与新游试玩归类追加验收

- 本轮标注图：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/codex-clipboard-675375fe-5eb1-4be8-b98a-fb22288dd9a4.png`；与最新 `discovery-playtest.png` 同输入对照，分段文案已由「公开」改为「通用」，英文为 General，保留原内部 public 标识与列表行为。
- 唯一官方发行清单中试玩助理标记 discovery/testing，重新生成官方契约；在新游发现筛选下命中一个试玩助理，卡片同时展示新游发现与游戏测试标签，通用引擎计数随筛选派生。
- E2E 校验中英文分段名称、新游发现命中完整插件 ID、两个标签同时存在，并通过既有阶段/引擎交集与主题/窄屏场景。类型、Lint、格式、源目录和架构检查通过，Lint 仍为 129 条既有警告、0 错误；架构 baseline/new 均为 0。
- 所有者、接口、事件顺序保持不变：发行清单拥有场景标签，Page 拥有筛选，安装启停事实仍由原 store 持有。无新增网络或持久化路径。
- 最新证据目录同上，截图 `discovery-playtest.png`；视觉 final result: passed。

- 累计改动规模（含规范、测试和验证页）：+1259 / -8 行，净增 1251 行；架构 baseline 0、new 0。
