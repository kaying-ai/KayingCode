"""KayingCode entrypoint for the pinned, unmodified Blender MCP distribution."""
import os
import sys
from types import ModuleType, SimpleNamespace
from weakref import ref


# 只放行诊断所需的原生观察命令。上游内部用 execute_code 模拟的工具也要先完成配对。
_OBSERVATIONS = frozenset({
    "get_addon_info", "get_scene_info", "get_object_info", "get_viewport_screenshot",
    "get_world_state_snapshot", "list_scene_items", "bpy_api_lookup", "describe_node_type",
    "get_telemetry_consent", "get_polyhaven_status", "get_sketchfab_status", "get_polypizza_status",
    "get_hunyuan3d_status", "get_hyper3d_status", "get_meshy_status", "get_tripo_status", "get_worldlabs_status",
})


def main():
    # 上游 Git 忽略私有 config.py，但 get_addon_status 仍会读取 telemetry_config。
    # 在本地入口显式提供禁用配置，避免状态查询失败；不修改 vendor 或安装包。
    config = ModuleType("blender_mcp.config")
    config.telemetry_config = SimpleNamespace(enabled=False)
    sys.modules[config.__name__] = config
    os.environ["DISABLE_TELEMETRY"] = "true"

    from blender_mcp import server as upstream

    class PairedBlenderConnection(upstream.BlenderConnection):
        _paired_socket = None

        def _send_command_locked(self, command_type, params=None):
            # doctor 的独立连接只能诊断。这里在同一发送锁里核对真实写入 socket，避免重连后沿用旧配对。
            paired = self.sock is not None and self._paired_socket and self._paired_socket() is self.sock
            if command_type not in _OBSERVATIONS and not paired:
                expected = upstream.EXPECTED_ADDON_PROTOCOL_VERSION
                try:
                    info = super()._send_command_locked("get_addon_info")
                except Exception as error:
                    raise RuntimeError("无法核验 Blender add-on 协议。请运行 /blender-doctor。") from error
                protocol = info.get("protocol_version") if isinstance(info, dict) else None
                if type(protocol) is not int or protocol != expected:
                    actual = protocol if type(protocol) is int else "未报告"
                    raise RuntimeError(
                        f"Blender add-on 协议不匹配（实际 {actual}，期望 {expected}）。请运行 /blender-doctor。"
                    )
                self._paired_socket = ref(self.sock)
            return super()._send_command_locked(command_type, params)

    upstream.BlenderConnection = PairedBlenderConnection
    upstream.main()


if __name__ == "__main__":
    main()
