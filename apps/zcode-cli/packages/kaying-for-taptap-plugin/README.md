# kaying-for-taptap 插件说明（给 Agent）

本目录是 KayingCode 内置的 TapTap Maker 转写/预览插件。  
遇到「转写对比」右侧 TapTap 预览异常时，先读本文件，不要盲目重复 build。

---

## 1. 最常见故障：`Token expired, please rebuild to refresh.`

### 现象

- 「转写对比」右侧 **TapTap 预览** 弹出：

  ```text
  Warning
  Token expired, please rebuild to refresh.
  ```

- 左侧原版 Web 正常；
- 浏览器直接打开 `https://maker.taptap.cn/app/<appId>` 也正常；
- **已经 rebuild 过、`preview_refresh: ok`，面板刷新/重开后仍弹**。

### 根因（必读）

这里有 **两套互不相通的 token**，不要混为一谈：

| 链路 | 凭据 | 接口 | 作用 |
| --- | --- | --- | --- |
| CLI 构建 / 重签 | `~/.taptap-maker/pat.json` 的 **PAT** | `POST …/apps/<id>/preview-refresh` | 服务端预览状态重签 |
| 网页预览 iframe | **用户 OAuth**（webview `localStorage` 的 `taptap_access_token`） | `POST …/api/v1/apps/<id>/preview-login` | 签出 iframe 的 `preview_login` |

游戏预览 iframe 实际地址形如：

```text
https://<something>.games.tapapps.cn/?preview_login=<token>
```

`preview_login` 来自 **`preview-login`**，必须用 **转写对比 webview 自己的 TapTap 登录态**。

- `preview-refresh`（PAT）返回 200，**只代表 CLI 侧 OK**；
- 面板 webview 没有有效 OAuth 时，`preview-login` 会 401 `AUTH_TOKEN_EXPIRED`，播放器就弹上面那个英文框；
- 所以 **「rebuild + preview_refresh: ok」修不好面板**。  
  文案里的 “please rebuild” 是 Maker 预览链路的提示语，**不是**「再 build 一次就一定好」。

### 为什么浏览器正常、面板不正常

| | 用户浏览器 | 转写对比面板 |
| --- | --- | --- |
| Cookie / localStorage | 用户自己的 TapTap 登录态 | 独立分区 `persist:kayingcode-taptap-preview` |
| `preview-login` | 可用 | 过期 / 未登录时失败 |
| `localDev=1` 预览 | 登录后正常 | 依赖分区内的 OAuth，与浏览器隔离 |

补充：

- 面板地址固定带 `?localDev=1&tab=preview`（见 `toTapTapGamePreviewUrl`）；
- **去掉 `localDev=1` 不能替代登录**：未登录时带不带 `localDev` 都会跳到 `maker.taptap.cn/intro` 落地页；
- 英文弹窗是 Maker 预览链路写死的文案（页面本身也是 `<html lang="en">`），**不是** KayingCode webview 的 `Accept-Language` 配错。改 webview 语言无效。

### 排查顺序（Agent 按这个做，不要跳步）

1. **确认是不是同一问题**  
   面板文案是 `Token expired, please rebuild to refresh.` → 走本节；若是空白页 / 登录页 / 游戏逻辑错误，不要套用本流程。

2. **先清缓存，再刷新（优先，无需登录）**  
   用「转写对比」顶部工具条的 **清理预览缓存**：
   - 会清 `persist:kayingcode-embedded-browser` + `persist:kayingcode-taptap-preview` 的 cache；
   - 成功后自动刷新两侧。  
   代码入口：`PluginBrowserCompareSidePaneContent` → `platform.clearEmbeddedBrowserData("cache", "all")`。

3. **仍弹 Token expired → 面板内重新登录**  
   在 **转写对比右侧 webview** 里打开 `https://maker.taptap.cn` 并登录 TapTap/制造账号，再回到预览刷新。  
   账密/扫码必须由用户完成，Agent 不要代填。

4. **确认登录态后，才考虑 build**  
   只有在 webview 已登录、仍怀疑服务端预览状态旧时，才执行 `maker_build_current_directory`（会附带 `preview_refresh`）。  
   **禁止**在未处理登录态时反复 rebuild。

5. **用地址栏做定位**  
   每侧地址栏支持：改址跳转 / 刷新此页 / 复制 / 系统浏览器打开。  
   可把 `preview_login=...` 地址复制到系统浏览器对照，区分「面板问题」和「token 问题」。

### 明确不要做的事

- 不要因为一次 `preview_refresh: ok` 就宣称预览已恢复；
- 不要打开「TapTap 游戏预览」单面板冒充转写验收（转写只用「转写对比」）；
- 不要改 KayingCode webview 的 `Accept-Language` 去修英文弹窗；
- 不要假设去掉 `localDev=1` 就能免登录进游戏；
- 不要把 PAT 写进 webview，或把 `pat.json` / `tap-auth.json` 拷进插件目录。

### 相关事实文件

| 文件 | 含义 |
| --- | --- |
| `.maker/kaying-for-taptap/preview-publication.v1.json` | 最近一次成功 TapTap 发布（operationId / revision / previewUrl） |
| `.maker/threejs-to-taptapmaker/compare-publication.v1.json` | 转写对比 receipt（source/target URL、viewport、target revision） |
| `~/.taptap-maker/pat.json` | CLI PAT（build / preview-refresh） |
| `~/.taptap-maker/tap-auth.json` | CLI MAC 凭据（与网页 OAuth 不同） |

若 compare receipt 的 `targetPublication.revision` 与 preview-publication 不一致，以 **当前 publication revision** 为准，重新 `prepare_visual_comparison`，不要用旧 guest 验新代码。

---

## 2. 转写对比面板工具（2026-09-30 起）

### 顶部工具条

| 控件 | 行为 |
| --- | --- |
| 清理预览缓存 | 清两个 partition 的 cache，成功后自动刷新两侧 |
| 刷新比较 | 按当前 receipt 重载两侧 |

### 每侧地址栏

`标签 + URL 输入 + 跳转 + 刷新此页 + 复制 + 在系统浏览器打开`

- 输入框支持省略 `https://`，回车或点跳转生效；
- 手动跳转会覆盖回执 URL；**新 publication 到达时会回到回执 URL**；
- 比较事实源仍是 comparison receipt，地址栏只是导航/排障入口。

实现位置：

- `packages/ui/src/plugin-browser-compare/PluginBrowserCompareSidePaneContent.tsx`
- `packages/ui/src/plugin-browser-compare/CompareBrowserUrlBar.tsx`
- 清理 API：`IPlatformService.clearEmbeddedBrowserData(mode, target?)`

---

## 3. 与其他文档的关系

| 文档 | 用途 |
| --- | --- |
| `skills/threejs-to-taptapmaker/SKILL.md` | 转写主流程、面板选择、发布门禁 |
| `skills/threejs-to-taptapmaker/references/visual-compare.md` | prepare / 双 guest / 截图对比 |
| `skills/threejs-to-taptapmaker/references/runtime-loop.md` | 远端优先，本地 runtime 仅兜底 |
| `skills/threejs-to-taptapmaker/references/pitfalls.md` | 其它踩坑 |
| **本 README** | **Token expired / 预览登录态 / 面板排障** |

遇到预览相关问题：先本 README → 仍无法定位再进 skill/reference。  
本文件只记录已验证结论；不确定的现象请先取证，不要写成通用规则。
