import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { diagnose } from "../scripts/diagnostics.mjs";
import { findExecutable, pluginRoot } from "../scripts/runtime.mjs";
import { startMcp } from "./mcp-client.mjs";

test(
  "real Blender GUI: draft preview and checkpoint before refinement, animation and delivery",
  { timeout: 90000 },
  async (t) => {
    const executable = await findExecutable("blender", {
      explicit: process.env.BLENDER_EXECUTABLE,
      candidates: ["/Applications/Blender.app/Contents/MacOS/Blender"],
    });
    assert.ok(executable, "Set BLENDER_EXECUTABLE to run this optional GUI acceptance test");
    const root = await mkdtemp(join(tmpdir(), "kayingcode-blender-gui-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const reserve = createServer();
    await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    for (const directory of ["config", "scripts"]) await mkdir(join(root, directory));
    const readyPath = join(root, "ready.json");
    const env = {
      ...process.env,
      BLENDER_HOST: "127.0.0.1",
      BLENDER_PORT: String(port),
      BLENDER_USER_CONFIG: join(root, "config"),
      BLENDER_USER_SCRIPTS: join(root, "scripts"),
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
        join(pluginRoot, "vendor/mcp-for-blender/addon.py"),
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
    const doctor = await diagnose(env);
    assert.equal(doctor.ready, true, JSON.stringify(doctor));
    const client = startMcp(join(pluginRoot, "scripts/launch.mjs"), env);
    t.after(() => client.close());
    await client.initialize();
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
      code: "import bpy\nbpy.ops.mesh.primitive_uv_sphere_add(location=(0,0,2))\nbpy.context.object.name='KayingCodeAcceptanceSphere'\nprint(bpy.context.object.name)",
    });
    assert.match(
      JSON.stringify(await call("get_scene_info", { query: "KayingCodeAcceptanceSphere" })),
      /KayingCodeAcceptanceSphere/,
    );
    const preview = await call("look", {
      mode: "angles",
      target: ["KayingCodeAcceptanceSphere"],
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
        "import bpy",
        "obj=bpy.data.objects['KayingCodeAcceptanceSphere']",
        "obj.scale=(1.2,1,1)",
        "material=bpy.data.materials.new('AcceptanceMaterial')",
        "material.diffuse_color=(0.8,0.2,0.1,1)",
        "obj.data.materials.append(material)",
        "scene=bpy.context.scene",
        "scene.frame_start=1; scene.frame_end=24",
        "for frame,x in [(1,0),(12,1),(24,0)]:",
        "    obj.location.x=x",
        "    obj.keyframe_insert(data_path='location',frame=frame)",
        "scene.frame_set(1)",
        "assert len([o for o in bpy.data.objects if o.name.startswith('KayingCodeAcceptanceSphere')]) == 1",
        "assert obj.data.materials[0].name == 'AcceptanceMaterial'",
        "assert obj.animation_data.action is not None",
        "positions=[]",
        "for frame in [1,12,24]:",
        "    scene.frame_set(frame)",
        "    positions.append(round(obj.location.x,2))",
        "assert positions == [0,1,0], positions",
        "scene.frame_set(1)",
        "print('refinement and motion verified')",
      ].join("\n"),
    });
    const animation = await call("look", {
      mode: "frames",
      target: ["KayingCodeAcceptanceSphere"],
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
      code: `import bpy\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend)})\nbpy.ops.export_scene.gltf(filepath=${JSON.stringify(glb)}, export_format='GLB')\nprint('saved and exported')`,
    });
    assert.ok((await readFile(blend)).length > 1000);
    assert.equal((await readFile(glb)).subarray(0, 4).toString(), "glTF");
  },
);
