"""Ephemeral GUI test server; never installs the addon or saves user preferences."""
import importlib.util
import json
import os
from pathlib import Path
import sys

import bpy

addon_path, port, ready_path = sys.argv[sys.argv.index("--") + 1:]
spec = importlib.util.spec_from_file_location("kayingcode_blender_test_addon", addon_path)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
addon.register()
addon._blendermcp_unregister_auto_start()
if bpy.app.timers.is_registered(addon._addon_update_check_on_startup):
    bpy.app.timers.unregister(addon._addon_update_check_on_startup)
bpy.context.scene.blendermcp_auto_start_server = False
bpy.types.blendermcp_server = addon.BlenderMCPServer(host="127.0.0.1", port=int(port))
bpy.types.blendermcp_server.start()
assert bpy.types.blendermcp_server.running
Path(ready_path).write_text(json.dumps({"port": int(port)}))

# 即使测试客户端异常退出，也只终止这个独立的 factory-startup 测试进程。
def deadline():
    os._exit(0)

bpy.app.timers.register(deadline, first_interval=90)
