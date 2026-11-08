# image-search

KayingCode 内置插件：为会话提供开放版权图片检索能力。

- 通过本地 stdio MCP server（`scripts/image-search-server.mjs`，零依赖 Node ≥ 18）调用
  [Openverse](https://api.openverse.org/) 公开 API，返回可直接引用的图片 URL、许可与来源页。
- 匿名访问有速率限制；server 会把限流信息透传给模型。
- localrun 语义：server 在本机运行，仅插件调用时出网；不提供也不需要任何鉴权配置。

MCP server 名：`image_search`（会话内以 `plugin:image-search:image_search` 命名空间暴露）。
