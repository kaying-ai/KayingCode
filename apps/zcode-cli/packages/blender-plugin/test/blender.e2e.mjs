import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { diagnose } from "../scripts/diagnostics.mjs";
import { findExecutable, pluginRoot } from "../scripts/runtime.mjs";
import { startMcp } from "./mcp-client.mjs";

const execute = promisify(execFile);

test(
  "real Blender GUI: draft preview and checkpoint before refinement, animation and delivery",
  { timeout: 90000 },
  async (t) => {
    const executable = await findExecutable("blender", {
      explicit: process.env.BLENDER_EXECUTABLE,
      candidates: ["/Applications/Blender.app/Contents/MacOS/Blender"],
    });
    assert.ok(executable, "Set BLENDER_EXECUTABLE to run this optional GUI acceptance test");
    // macOS 的 /var 是 /private/var 的别名，模块入口会采用真实路径。
    const root = await realpath(await mkdtemp(join(tmpdir(), "kayingcode-blender-gui-")));
    t.after(() => rm(root, { recursive: true, force: true }));
    const reserve = createServer();
    await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    for (const directory of ["config", "scripts"]) await mkdir(join(root, directory));
    const staged = join(root, "Staged Blender plugin");
    await mkdir(staged);
    for (const entry of ["scripts", "vendor", "upstream-lock.json", "skills", ".mcp.json"])
      await cp(join(pluginRoot, entry), join(staged, entry), { recursive: true });
    const readyPath = join(root, "ready.json");
    const env = {
      ...process.env,
      BLENDER_HOST: "127.0.0.1",
      BLENDER_PORT: String(port),
      BLENDER_USER_CONFIG: join(root, "config"),
      BLENDER_USER_SCRIPTS: join(root, "scripts"),
      BLENDERMCP_NO_UPDATE_CHECK: "1",
      DISABLE_TELEMETRY: "true",
    };
    const blender = spawn(
      executable,
      [
        "--factory-startup",
        "--noaudio",
        "--python",
        join(pluginRoot, "test/blender-fixture.py"),
        "--",
        join(staged, "vendor/mcp-for-blender/addon.py"),
        String(port),
        readyPath,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    blender.stdout.on("data", (chunk) => {
      log = (log + chunk).slice(-12000);
    });
    blender.stderr.on("data", (chunk) => {
      log = (log + chunk).slice(-12000);
    });
    t.after(async () => {
      if (blender.exitCode !== null) return;
      blender.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => blender.kill("SIGKILL"), 3000);
        blender.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    });
    for (let attempt = 0; ; attempt++) {
      try {
        await access(readyPath);
        break;
      } catch {
        assert.ok(attempt < 150 && blender.exitCode === null, log);
        await delay(100);
      }
    }
    let client = startMcp(join(staged, "scripts/launch.mjs"), env);
    t.after(() => client.close());
    await client.initialize();
    const doctor = await diagnose(env, staged);
    assert.equal(doctor.ready, true, JSON.stringify(doctor));
    assert.equal(doctor.installation.addonPath, join(staged, "vendor/mcp-for-blender/addon.py"));
    const isolatedDoctor = startMcp(join(staged, "scripts/doctor-server.mjs"), {
      ...env,
      KAYINGCODE_BLENDER_UV: join(root, "missing uv"),
      KAYINGCODE_BLENDER_CACHE: join(root, "missing runtime"),
    });
    t.after(() => isolatedDoctor.close());
    await isolatedDoctor.initialize();
    const blocked = JSON.parse(
      (await isolatedDoctor.request("tools/call", { name: "blender_doctor" })).content[0].text,
    );
    assert.equal(blocked.ready, false);
    assert.equal(blocked.installation.addonPath, doctor.installation.addonPath);
    assert.equal(blocked.checks.find(({ id }) => id === "uv").status, "error");
    assert.equal(blocked.checks.find(({ id }) => id === "python-runtime").status, "error");
    assert.equal(blocked.checks.find(({ id }) => id === "addon").status, "pass");
    const tools = await client.request("tools/list");
    assert.ok(tools.tools.some((tool) => tool.name === "execute_blender_code"));
    const call = async (name, args = {}) => {
      const result = await client.request("tools/call", { name, arguments: args });
      assert.ok(
        !result.isError && !result.content.some((block) => /^Error/.test(block.text || "")),
        JSON.stringify(result),
      );
      return result;
    };
    await call("get_addon_status");
    await call("get_scene_info");
    await call("execute_blender_code", {
      code: [
        "import bpy, math",
        "bpy.ops.mesh.primitive_cube_add()",
        "door=bpy.context.object",
        "door.name='DoorLeaf'",
        "for vert in door.data.vertices:",
        "    vert.co=((vert.co.x + 1) / 2, vert.co.y * 0.05, vert.co.z + 1)",
        "door.data.update()",
        "material=bpy.data.materials.new('DoorPaint')",
        "material.diffuse_color=(0.8,0.2,0.1,1)",
        "door.data.materials.append(material)",
        "for frame, angle in [(1,0), (12,math.pi/2), (24,0)]:",
        "    door.rotation_euler.z=angle",
        "    door.keyframe_insert(data_path='rotation_euler',frame=frame)",
        "door.animation_data.action.name='Door_Open'",
        "bpy.ops.mesh.primitive_cube_add(size=0.25, location=(4,0,0))",
        "bpy.context.object.name='UnrelatedProp'",
        "bpy.context.scene.frame_set(1)",
        "print('Initial door and animation ready')",
      ].join("\n"),
    });
    assert.match(JSON.stringify(await call("get_scene_info", { query: "DoorLeaf" })), /DoorLeaf/);
    const preview = await call("look", {
      mode: "angles",
      shading: "solid",
      target: ["DoorLeaf"],
      views: ["front", "three_quarter"],
      max_size: 400,
    });
    const image = preview.content.find((block) => block.type === "image");
    assert.ok(image, "Actual Blender preview image required");
    const outputRoot = process.env.KAYINGCODE_BLENDER_E2E_OUTPUT || root;
    await mkdir(outputRoot, { recursive: true });
    await writeFile(join(outputRoot, "preview.png"), Buffer.from(image.data, "base64"));
    const draft = join(outputRoot, "draft.blend");
    await call("execute_blender_code", {
      code: `import bpy\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(draft)})\nprint('draft checkpoint saved')`,
    });
    assert.ok((await readFile(draft)).length > 1000, "Draft must be usable before refinement");
    await call("execute_blender_code", {
      code: [
        "import bpy, math",
        "door=bpy.data.objects['DoorLeaf']",
        "for vert in door.data.vertices:",
        "    vert.co.x *= 1.2",
        "door.data.update()",
        "scene=bpy.context.scene",
        "assert len([o for o in bpy.data.objects if o.name.startswith('DoorLeaf')]) == 1",
        "assert door.data.materials[0].name == 'DoorPaint'",
        "assert door.animation_data.action.name == 'Door_Open'",
        "assert tuple(bpy.data.objects['UnrelatedProp'].location) == (4,0,0)",
        "for frame, angle in [(1,0), (12,math.pi/2), (24,0)]:",
        "    scene.frame_set(frame)",
        "    assert math.isclose(door.rotation_euler.z, angle, abs_tol=0.0001)",
        "scene.frame_set(1)",
        "print('refinement and motion verified')",
      ].join("\n"),
    });
    await client.close();
    client = startMcp(join(staged, "scripts/launch.mjs"), env);
    await client.initialize();
    assert.match(JSON.stringify(await call("get_scene_info", { query: "DoorLeaf" })), /DoorLeaf/);
    const checker = await readFile(join(staged, "scripts/asset-check.py"), "utf8");
    for (const [code, message] of [
      [
        'inspect_asset("DoorLeaf", requirements={"DoorLeaf": {"dimensions": [1, 2]}})',
        /dimensions must be a list of 3/,
      ],
      [
        'inspect_asset("DoorLeaf", requirements={"DoorLeaf": {"max_triangles": -1}})',
        /non-negative integer/,
      ],
      ['inspect_asset("DoorLeaf", requirements={"DoorLeaf": {"unknown": 1}})', /Unknown checks/],
    ]) {
      const rejected = await call("execute_blender_code", { code: `${checker}\n${code}` });
      assert.match(rejected.content[0].text, message);
    }
    const missingCamera = await call("execute_blender_code", {
      code: `import bpy\nbpy.context.scene.camera = None\n${checker}\ninspect_asset("DoorLeaf", require_camera=True)`,
    });
    const missingRows = JSON.parse(
      missingCamera.content[0].text.replace(/^Code executed successfully: /, ""),
    );
    assert.equal(missingRows.find((row) => row.check === "active_camera").status, "needs-fix");
    await call("execute_blender_code", {
      code: "import bpy\ncamera = bpy.data.objects['Camera']\ncamera.name = 'DeliveryCamera'\nbpy.context.scene.camera = camera",
    });
    const inspection = await call("execute_blender_code", {
      code: `${checker}\ninspect_asset("DoorLeaf", require_camera=True, requirements={"DoorLeaf": {"dimensions": [1.2, 0.1, 2], "origin": [0, 0, 0], "max_triangles": 1, "materials": ["DoorPaint"], "action": "Door_Open", "frame_range": [1, 24]}})`,
    });
    const rows = JSON.parse(
      inspection.content[0].text.replace(/^Code executed successfully: /, ""),
    );
    const check = Object.fromEntries(rows.map((row) => [row.check, row]));
    assert.equal(check.active_camera.status, "pass");
    assert.equal(check.active_camera.actual, "DeliveryCamera");
    for (const field of ["dimensions", "origin", "materials", "action", "frame_range"])
      assert.equal(check[field].status, "pass", JSON.stringify(check[field]));
    assert.equal(check.max_triangles.actual, 12);
    assert.equal(check.max_triangles.status, "needs-fix");
    const animation = await call("look", {
      mode: "frames",
      shading: "solid",
      target: ["DoorLeaf"],
      frames: [1, 12, 24],
      view: "front",
      distance: 8,
      max_size: 600,
    });
    const animationImage = animation.content.find((block) => block.type === "image");
    assert.ok(animationImage, "Animation stage requires an actual frame strip");
    await writeFile(join(outputRoot, "animation.png"), Buffer.from(animationImage.data, "base64"));
    const blend = join(outputRoot, "acceptance.blend"),
      glb = join(outputRoot, "acceptance.glb");
    await call("execute_blender_code", {
      code: [
        "import bpy",
        `bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend)})`,
        "selection = list(bpy.context.selected_objects)",
        "active = bpy.context.view_layer.objects.active",
        "try:",
        "    for obj in selection: obj.select_set(False)",
        "    bpy.data.objects['DoorLeaf'].select_set(True)",
        `    bpy.ops.export_scene.gltf(filepath=${JSON.stringify(glb)}, export_format='GLB', use_selection=True)`,
        "finally:",
        "    bpy.data.objects['DoorLeaf'].select_set(False)",
        "    for obj in selection: obj.select_set(True)",
        "    bpy.context.view_layer.objects.active=active",
        "assert set(bpy.context.selected_objects) == set(selection)",
        "assert bpy.context.view_layer.objects.active == active",
        "print('saved and exported')",
      ].join("\n"),
    });
    assert.ok((await readFile(blend)).length > 1000);
    assert.equal((await readFile(glb)).subarray(0, 4).toString(), "glTF");
    const validation = await execute(
      executable,
      [
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python-expr",
        [
          "import bpy",
          `bpy.ops.wm.open_mainfile(filepath=${JSON.stringify(blend)})`,
          "assert bpy.context.scene.camera.name == 'DeliveryCamera'",
          "obj=bpy.data.objects['DoorLeaf']",
          "assert abs(obj.dimensions.x - 1.2) < 0.001",
          "assert obj.data.materials[0].name == 'DoorPaint'",
          "assert obj.animation_data.action.name == 'Door_Open'",
          "assert tuple(bpy.data.objects['UnrelatedProp'].location) == (4,0,0)",
          "bpy.ops.wm.read_factory_settings(use_empty=True)",
          `bpy.ops.import_scene.gltf(filepath=${JSON.stringify(glb)})`,
          "obj=bpy.data.objects['DoorLeaf']",
          "assert obj.data.materials[0].name.startswith('DoorPaint')",
          "assert bpy.data.objects.get('UnrelatedProp') is None",
          "assert any(action.name.startswith('Door_Open') for action in bpy.data.actions)",
          "print('Reopened blend and imported GLB')",
        ].join("\n"),
      ],
      { env, timeout: 30000 },
    );
    assert.match(validation.stdout, /Reopened blend and imported GLB/);
  },
);
