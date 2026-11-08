# 同源上游 Web

ASSETS 提供构建后的 remote 制品与下文的域名校验文件。`/remote/v4` 无扩展名路由在资产缺失时回落到 `/remote/`，保持原 URL。图标/PDF 的根路径映射至同一制品目录。

完整授权 URL 由 Desktop 生成。Web bootstrap 自动领取 authorize 邀请并清除 fragment，工作台会话和连接逻辑来自固定官方源码。Taro/Flutter 自托管入口打开该完整 URL，由浏览器管理授权和连接。

验收：GET/HEAD 页面和静态资源、SPA 路由保持、未知入口 404、非读取方法 405；构建复制时清理 public 生成目录。见 mobileWebAssets.test.ts、worker.test.ts 和 webRemoteV2.integration.test.ts。

许可材料随同一 remote 制品复制：当前产品声明与保留的上游声明都须可读取；集成验证 HTTP 200、SHA-256 与 mobile-web-manifest 登记一致，并检查 HTML 的两份 license 链接，不把页面可访问当作许可交付已完整。

微信业务域名校验文件 `69txzPKb7q.txt` 由 Relay 的静态制品构建从 `domain-verification/` 原样复制到公开目录根。Worker 只将对应的精确根路径交给 ASSETS，允许匿名 GET/HEAD，禁止其他方法，缺失时直接返回资产 404。验收从公网根路径请求文件，要求 HTTP 200、无重定向、响应字节与原件一致，并检查远控入口及其他根路径。
