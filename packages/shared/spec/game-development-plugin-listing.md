# 游戏开发展示元数据

`gameDevelopmentPluginListingSchema` 是游戏引擎、生命周期与源码声明的唯一协议规则，公开导出供 Agent 契约、目录适配器和 UI 使用。

- `engines`: `taptap-maker | unreal | unity | tuanji | godot | threejs | cocos-creator` 数组，空数组代表通用能力。
- `stages`: 非空 `discovery | development | assets | testing | advertising | publishing` 数组。
- `source`: 可选严格联合；`open-source` 必须带 HTTPS GitHub 仓库 URL（禁止凭据、端口、query/hash、非仓库路径）；`closed-source` 不带仓库 URL。缺省表示未声明，不推断闭源。
- 对象拒绝未知字段；插件 listing 扩展为可选字段，兼容旧协议数据。
- 目录适配器验证失败时仅丢弃此展示扩展，不丢弃可用插件；不访问网络。

产品布局与验收见 `packages/ui/spec/game-development-plugins.md`。

官方发行清单中的声明示例（示例仓库不代表真实发行插件）：

```json
{
  "gameDevelopment": {
    "engines": ["unity"],
    "stages": ["development", "testing"],
    "source": {
      "kind": "open-source",
      "repositoryUrl": "https://github.com/example/game-plugin"
    }
  }
}
```

`closed-source` 只需 `source: { "kind": "closed-source" }`；完整源码公开情况尚未确认时省略 `source`。上游依赖开源、包内许可证存在或使用开源引擎，均不能替代完整插件源码声明。
