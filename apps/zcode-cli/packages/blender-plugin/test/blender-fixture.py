"""Install and start the real addon in the test process's isolated Blender profile."""
import json
import os
from pathlib import Path
import sys

import bpy

addon_path, port, ready_path = sys.argv[sys.argv.index("--") + 1:]
assert bpy.ops.preferences.addon_install(filepath=addon_path) == {"FINISHED"}
assert bpy.ops.preferences.addon_enable(module=Path(addon_path).stem) == {"FINISHED"}
bpy.context.scene.blendermcp_port = int(port)
assert bpy.ops.blendermcp.start_server() == {"FINISHED"}
server = bpy.types.blendermcp_server
assert server.running and server.host == "localhost" and server.port == int(port)
Path(ready_path).write_text(json.dumps({"port": int(port)}))

# 即使测试客户端异常退出，也只终止这个独立的 factory-startup 测试进程。
def deadline():
    os._exit(0)

bpy.app.timers.register(deadline, first_interval=90)
