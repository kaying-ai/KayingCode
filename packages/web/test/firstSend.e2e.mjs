// 仅连接专用、已授权的本地测试浏览器；明确发送无工具 QA 指令并归档本脚本创建的任务。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const exec = promisify(execFile);
const cdp = process.env.REMOTE_FIRST_SEND_CDP;
if (!cdp || !["127.0.0.1", "localhost"].includes(new URL(cdp).hostname))
  throw new Error("Set REMOTE_FIRST_SEND_CDP to a dedicated authorized test browser");
const session = `remote-first-send-${Date.now()}`;
const artifacts = resolve(import.meta.dirname, "../../../.tmp/remote-first-send-e2e");
await mkdir(artifacts, { recursive: true });
async function ab(...args) {
  try {
    const { stdout } = await exec(
      "agent-browser",
      ["--session", session, "--cdp", cdp, "--json", ...args],
      { maxBuffer: 6e6 },
    );
    const result = JSON.parse(stdout);
    if (!result.success) throw new Error();
    return result.data;
  } catch {
    // 浏览器错误可能包含凭据 URL；验证日志只记录动作名。
    throw new Error(`Browser action failed: ${args[0]}`);
  }
}
const evaluate = async (source) => {
  const result = (await ab("eval", source)).result;
  return typeof result === "string" ? JSON.parse(result) : result;
};
const taskIds = () =>
  evaluate(
    'JSON.stringify([...document.querySelectorAll("[data-testid^=task-item-]")].map(e=>e.getAttribute("data-testid")))',
  );
async function waitFor(source, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(source)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Web condition timed out");
}
const receivedReply =
  '/(?:^|\\n)OK(?:\\n|$)/.test(document.querySelector("[data-testid=v4-timeline]")?.innerText || "") && !!document.querySelector("[data-testid=v4-composer-input]") && !document.querySelector("[data-testid=chat-empty]")';
let created;
try {
  await ab("set", "viewport", "1178", "793");
  const before = new Set(await taskIds());
  await ab("click", '[data-testid="task-new-button"]');
  await waitFor('!!document.querySelector("[data-testid=chat-empty]")');
  await ab(
    "fill",
    '[data-testid="v4-composer-input"]',
    "Reply with exactly OK. Do not use any tools.",
  );
  // 修复依据：Enter 在某些输入设置下只换行，必须点击真实发送按钮验证 admission 与 UI 提升。
  await ab("click", '[data-testid="v4-composer-send"]');
  await waitFor('!document.querySelector("[data-testid=chat-empty]")');
  const newTasks = (await taskIds()).filter((id) => !before.has(id));
  assert.equal(newTasks.length, 1, "Exactly one QA task must become visible");
  created = newTasks[0];
  console.log("QA task persisted and draft promoted to conversation");
  // 模型回复耗时独立于 admission/目录提升；不以标题或仅打开会话当作回复成功。
  await waitFor(receivedReply, 180_000);
  assert.equal(
    await evaluate('!!document.querySelector("[data-testid=v4-retry-subscribe]")'),
    false,
  );
  await ab("screenshot", resolve(artifacts, "first-send-conversation.png"));
  await ab("reload");
  await waitFor(`!!document.querySelector('[data-testid="${created}"]')`);
  await ab("click", `[data-testid="${created}"]`);
  await waitFor(receivedReply);
  await ab("set", "viewport", "390", "844");
  await ab("click", `[data-testid="${created}"]`);
  await waitFor(receivedReply);
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  await ab("screenshot", resolve(artifacts, "mobile-restored.png"));
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        firstSendPromoted: true,
        receivedOK: true,
        reloadRestored: true,
        mobileReopened: true,
        mobileViewport: [390, 844],
        horizontalOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Official Web first send: conversation promotion, OK reply, reload and mobile reopen passed",
  );
} finally {
  if (created) {
    await ab("set", "viewport", "1178", "793");
    const archive = `[data-testid="${created.replace("task-item-", "task-archive-")}"]`;
    // 上游归档为原位两次确认；只归档本脚本新建的任务。
    await ab("click", archive);
    await ab("click", archive);
    await waitFor(`!document.querySelector('[data-testid="${created}"]')`);
  }
  // CDP 浏览器归调用方所有；由调用方注销该测试终端并关闭浏览器。
}
