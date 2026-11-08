import { access } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import {
  capture,
  findExecutable,
  findUv,
  pluginRoot,
  resolveConnection,
  runtimePlan,
} from "./runtime.mjs";
import { verifyUpstream } from "./verify-upstream.mjs";
import { inspectAddonFiles } from "./addon-files.mjs";
import { verifyRuntimeProject } from "./prepare-runtime.mjs";

const check = (id, status, evidence, suggestion = "") => ({ id, status, evidence, suggestion });
const addonAdvice =
  "在 Blender 中安装随包 add-on（vendor/mcp-for-blender/addon.py），启用 MCP for Blender，重启 Blender 后点击 Start MCP Server。不要使用未固定版本的 uvx 更新命令。";

export async function probeAddon(connection, expectedProtocol, timeoutMs = 2500) {
  return new Promise((resolveProbe) => {
    const socket = createConnection(connection);
    let chunks = [],
      size = 0,
      finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      resolveProbe(result);
    };
    // 这是诊断截止时间，不用它重试或判断场景操作是否执行。
    const timer = setTimeout(
      () =>
        finish(
          check(
            "addon",
            "warning",
            "只读握手超时，未能验证 add-on。",
            "Blender 可能忙碌或被弹窗阻塞；等待当前操作完成，核对端口后重新诊断，勿重放修改。",
          ),
        ),
      timeoutMs,
    );
    socket.once("connect", () =>
      socket.write(JSON.stringify({ type: "get_addon_info", params: {} })),
    );
    socket.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024)
        return finish(
          check("addon", "error", "握手响应超过 1 MiB。", "检查是否连接到了其他服务。"),
        );
      chunks.push(chunk);
      let reply;
      try {
        reply = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return;
      }
      if (reply?.status !== "success" || !Number.isInteger(reply?.result?.protocol_version)) {
        const reason =
          typeof reply?.message === "string"
            ? reply.message.slice(0, 200)
            : "响应缺少 get_addon_info protocol_version。";
        return finish(check("addon", "error", reason, addonAdvice + "核对端口是否属于 Blender。"));
      }
      const info = reply.result;
      if (info.protocol_version !== expectedProtocol)
        return finish(
          check(
            "addon",
            "error",
            `add-on protocol ${info.protocol_version}，随包服务端要求 ${expectedProtocol}。`,
            addonAdvice,
          ),
        );
      finish(
        check(
          "addon",
          "pass",
          `Blender ${info.blender_version || "版本未知"}，add-on protocol ${info.protocol_version}。`,
        ),
      );
    });
    socket.once("end", () =>
      finish(
        check(
          "addon",
          "error",
          size ? "连接关闭前未收到完整 JSON 握手。" : "服务关闭了连接，未返回 get_addon_info。",
          "端口可能被其他服务占用，或 add-on 发生异常；检查 Blender 控制台并重新启动 add-on 服务。",
        ),
      ),
    );
    socket.once("error", (error) => {
      const refused = error.code === "ECONNREFUSED";
      finish(
        check(
          "addon",
          "error",
          `连接失败：${error.code || "socket error"}。`,
          refused
            ? "该地址未监听。确认 Blender 已打开、add-on 已启用并启动服务，且 BLENDER_HOST/BLENDER_PORT 与面板一致；这不能证明 Blender 未安装。"
            : "核对 BLENDER_HOST、DNS、网络与隧道；远程 Blender 应通过受保护的隧道访问。",
        ),
      );
    });
  });
}

async function blenderCheck(env, remote) {
  if (remote)
    return check(
      "blender-app",
      "warning",
      "配置指向远端，未检查远端 Blender 可执行文件。",
      "Blender 和 add-on 必须在 BLENDER_HOST 指向的主机运行。依赖检查针对 MCP 执行主机。",
    );
  const executable = await findExecutable("blender", {
    env,
    explicit: env.BLENDER_EXECUTABLE,
    candidates: ["/Applications/Blender.app/Contents/MacOS/Blender", "/snap/bin/blender"],
  });
  if (!executable)
    return check(
      "blender-app",
      "warning",
      "未在 PATH/标准位置发现 Blender；安装状态未知。",
      "若已安装，可设置 BLENDER_EXECUTABLE 为绝对路径；Windows 的版本安装目录通常不在 PATH 中。握手结果可确认正在运行的 Blender。",
    );
  try {
    return check(
      "blender-app",
      "pass",
      (await capture(executable, ["--version"], { env })).split("\n")[0],
    );
  } catch (error) {
    return check(
      "blender-app",
      "warning",
      `无法运行 Blender 版本检查：${error.message}`,
      "核对 BLENDER_EXECUTABLE、执行权限及系统依赖。运行中应用仍以 add-on 握手为准。",
    );
  }
}

export async function diagnose(env = process.env, root = pluginRoot) {
  const checks = [];
  let lock;
  try {
    lock = await verifyUpstream(root);
    checks.push(
      check("snapshot", "pass", `固定上游 ${lock.version} / ${lock.commit}，文件 hash 全部一致。`),
    );
  } catch (error) {
    checks.push(
      check(
        "snapshot",
        "error",
        error.message,
        "恢复内置 Blender 插件；维护者重新同步并校验上游快照。",
      ),
    );
  }
  const uv = await findUv(env);
  if (!uv)
    checks.push(
      check(
        "uv",
        "error",
        "未找到可执行的 uv。",
        "安装官方 uv；GUI PATH 不一致时设置 KAYINGCODE_BLENDER_UV 为 uv 的绝对路径，然后重新启用插件。",
      ),
    );
  else {
    try {
      checks.push(check("uv", "pass", await capture(uv, ["--version"], { env })));
    } catch (error) {
      checks.push(
        check(
          "uv",
          "error",
          `uv 无法执行：${error.message}`,
          "核对 uv 的路径、执行权限及系统架构。",
        ),
      );
    }
  }
  if (lock) {
    const plan = runtimePlan(root, lock, env);
    try {
      await verifyRuntimeProject(plan, lock);
      await access(plan.python);
      const version = await capture(
        plan.python,
        [
          "-B",
          "-c",
          "import sys, importlib.metadata as m, tomllib; import mcp, httpx; assert sys.version_info[:2] == (3, 11); lock=tomllib.load(open(sys.argv[1], 'rb')); pinned={p['name']:p['version'] for p in lock['package']}; assert all(m.version(p) == pinned[p] for p in ['mcp', 'httpx', 'mcp-for-blender']); print(m.version('mcp-for-blender'))",
          join(root, "vendor/mcp-for-blender/uv.lock"),
        ],
        { env },
      );
      if (version !== lock.version) throw new Error("缓存项目版本与快照不一致");
      checks.push(
        check("python-runtime", "pass", `Python 3.11 和 MCP/httpx 已就绪，项目 ${version}。`),
      );
    } catch (error) {
      checks.push(
        check(
          "python-runtime",
          "error",
          `固定 Python 运行环境尚未就绪：${error.code || error.message}`,
          "启动或重新启用 Blender 插件，由 uv 按 uv.lock 准备独立环境；首次需要下载 Python/依赖。失败时检查网络、代理、证书和缓存目录写权限。doctor 不下载或修复环境。",
        ),
      );
    }
  }
  let connection;
  try {
    connection = resolveConnection(env);
    checks.push(check("connection-config", "pass", "连接地址和端口格式有效。"));
  } catch (error) {
    checks.push(
      check("connection-config", "error", error.message, "修正 BLENDER_PORT 并重新启用插件。"),
    );
  }
  const remote = connection && !["localhost", "127.0.0.1", "::1"].includes(connection.host);
  checks.push(await blenderCheck(env, remote));
  if (lock && !remote) {
    try {
      checks.push(await inspectAddonFiles(lock.addonProtocol, env));
    } catch (error) {
      checks.push(
        check(
          "addon-files",
          "warning",
          `未能读取 add-on 配置：${error.code || error.message}`,
          "检查当前用户 Blender 配置的读取权限；以运行中的握手为准。",
        ),
      );
    }
  }
  if (connection && lock) checks.push(await probeAddon(connection, lock.addonProtocol));
  return {
    ready: ["snapshot", "uv", "python-runtime", "connection-config", "addon"].every((id) =>
      checks.some((item) => item.id === id && item.status === "pass"),
    ),
    upstream: lock
      ? { repository: lock.repository, version: lock.version, commit: lock.commit }
      : null,
    checks,
  };
}
