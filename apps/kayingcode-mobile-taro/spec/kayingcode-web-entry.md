## 桌面扫码 Web 通道修复（2026-11-05）

遵循 [跨端入口规范](../../../packages/desktop/spec/mobile-web-remote.md)：同时接受原始配对串及 Web v1 二维码；按 Bot 隔离网页凭据，网页唯一拥有配对和恢复，不并行建立原生连接。配置不可用时显式报错并允许重试。

V2 桌面授权入口按 shared mobile-client-core 的 webEntryVersion=2 直接打开完整原始 URL；不请求 /v1/client-config，不把邀请作为 Node Relay claim，也不重建 fragment。业务 Web 由官方源码构建，容器不维护会话 UI。

H5 内嵌页用单行容器工具栏显示连接名、刷新、更多和关闭；更多内提供浏览器打开与复制链接。关闭退出容器，网页内的返回仍由 Web 导航历史处理。微信正常加载时使用系统 WebView 页头；微信加载失败后壳层保留重试和复制链接。验收覆盖窄屏单行、失败后重试、关闭并重开。

## 验证记录（2026-11-05）

- `node apps/kayingcode-mobile-taro/scripts/kayingcode-web-h5.e2e.mjs` 全部通过：320/375px、深/浅色、首页/Bot/设备三入口、v1 Web 链接发现、刷新、错误与迟到事件、重试、返回再开。
- V2 场景通过：完整 `/remote/v4#authorize=...` 原样交给 iframe；禁用 `/v1/client-config` 后仍可打开；壳层不 claim、不创建 socket。
- 已删除档案不加载 iframe；截图输出到根 `.tmp/taro-kayingcode-web-e2e/`。
- 未执行：微信小程序真机、iOS/Android 原生容器真机。
