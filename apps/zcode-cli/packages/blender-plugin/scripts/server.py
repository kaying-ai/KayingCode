"""KayingCode entrypoint for the pinned, unmodified Blender MCP distribution."""
import os
import sys
from types import ModuleType, SimpleNamespace


def main():
    # 上游 Git 忽略私有 config.py，但 get_addon_status 仍会读取 telemetry_config。
    # 在本地入口显式提供禁用配置，避免状态查询失败；不修改 vendor 或安装包。
    config = ModuleType("blender_mcp.config")
    config.telemetry_config = SimpleNamespace(enabled=False)
    sys.modules[config.__name__] = config
    os.environ["DISABLE_TELEMETRY"] = "true"

    from blender_mcp.server import main as upstream_main

    upstream_main()


if __name__ == "__main__":
    main()
