import { spawn } from "node:child_process";
import { findUv, pluginRoot, resolveConnection, runtimePlan } from "./runtime.mjs";
import { verifyUpstream } from "./verify-upstream.mjs";
import { prepareRuntime } from "./prepare-runtime.mjs";

try {
  const { host, port } = resolveConnection();
  const lock = await verifyUpstream();
  const uv = await findUv();
  if (!uv) throw new Error("未找到 uv。安装 uv 或设置 KAYINGCODE_BLENDER_UV 为绝对路径。");
  const plan = runtimePlan(pluginRoot, lock);
  await prepareRuntime(plan, lock);
  // 向 Python 传递和 doctor 相同的解析结果，避免空白地址导致两者检查不同目标。
  const env = { ...plan.env, BLENDER_HOST: host, BLENDER_PORT: String(port) };
  const child = spawn(uv, plan.args, { env, stdio: "inherit", windowsHide: true });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
  const code = await new Promise((resolveRun, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolveRun(exitCode ?? (signal ? 1 : 0)));
  });
  process.exitCode = code;
} catch (error) {
  process.stderr.write(`[blender] ${error.message}\n请调用 blender_doctor 获取诊断和建议。\n`);
  process.exitCode = 1;
}
