// 显式连接运行中的本仓 Desktop，只读取已有会话；不发送消息、不新建任务。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const exec = promisify(execFile);
const cdp = process.env.UPSTREAM_WEB_E2E_CDP;
if (!cdp || !["127.0.0.1", "localhost"].includes(new URL(cdp).hostname))
  throw new Error("Set UPSTREAM_WEB_E2E_CDP to the local Desktop CDP endpoint");
const desktop = "upstream-desktop-e2e";
const browser = `upstream-web-e2e-${Date.now()}`;
const artifacts = resolve(import.meta.dirname, "../../../.tmp/upstream-v2-e2e");
await mkdir(artifacts, { recursive: true });
async function ab(session, args, onDesktop = false) {
  let stdout;
  try {
    ({ stdout } = await exec(
      "agent-browser",
      ["--session", session, ...(onDesktop ? ["--cdp", cdp] : []), "--json", ...args],
      { env: process.env, maxBuffer: 6e6 },
    ));
  } catch {
    throw new Error(`Browser action failed: ${args[0]}`);
  }
  const value = JSON.parse(stdout);
  // CLI 错误可能含导航 URL，不能把一次性邀请带入验证日志。
  if (!value.success) throw new Error(`Browser action rejected: ${args[0]}`);
  return value.data;
}
async function evaluate(session, source, onDesktop = false) {
  const value = (await ab(session, ["eval", source], onDesktop)).result;
  return typeof value === "string" ? JSON.parse(value) : value;
}
let opened = false;
try {
  if (
    !(await evaluate(
      desktop,
      '!!document.querySelector("[data-testid=mobile-remote-start]")',
      true,
    ))
  ) {
    await ab(desktop, ["click", '[data-testid="desktop-mobile-pairing-button"]'], true);
  }
  await ab(desktop, ["click", '[data-testid="mobile-remote-start"]'], true);
  await ab(
    desktop,
    [
      "wait",
      "--fn",
      '!!document.querySelector("[role=dialog] img") && !document.querySelector("[data-testid=mobile-remote-copy]").disabled',
    ],
    true,
  );
  await evaluate(
    desktop,
    `window.__clipboardWrite = navigator.clipboard.writeText; navigator.clipboard.writeText = async value => { window.__invitationLink = value; }; true`,
    true,
  );
  let href;
  try {
    await ab(desktop, ["click", '[data-testid="mobile-remote-copy"]'], true);
    href = (await ab(desktop, ["eval", "window.__invitationLink"], true)).result;
  } finally {
    await evaluate(
      desktop,
      "navigator.clipboard.writeText = window.__clipboardWrite; delete window.__clipboardWrite; delete window.__invitationLink; true",
      true,
    );
  }
  const parsed = new URL(href);
  assert.equal(parsed.pathname, "/remote/v4");
  assert.ok(parsed.hash.startsWith("#authorize="));
  await ab(browser, ["open", href]);
  opened = true;
  await ab(browser, ["set", "viewport", "390", "844"]);
  await ab(browser, ["wait", "--fn", '!!document.querySelector("[data-testid=sidebar]")']);
  assert.equal(await evaluate(browser, "!!location.hash"), false);
  await ab(browser, [
    "wait",
    "--fn",
    'document.querySelectorAll("[data-testid^=task-item-]").length > 0',
  ]);
  const count = await evaluate(
    browser,
    'document.querySelectorAll("[data-testid^=task-item-]").length',
  );
  assert.ok(count > 0, "This read-only scenario requires an existing session");
  await ab(browser, ["find", "first", '[data-testid^="task-item-"]', "click"]);
  await ab(browser, [
    "wait",
    "--fn",
    '!!document.querySelector("[contenteditable=true],textarea")',
  ]);
  assert.equal(
    await evaluate(browser, '!!document.querySelector("[data-testid=v4-retry-subscribe]")'),
    false,
  );
  await ab(browser, ["screenshot", resolve(artifacts, "official-mobile-session.png")]);
  await ab(browser, ["reload"]);
  await ab(browser, [
    "wait",
    "--fn",
    '!!document.querySelector("[contenteditable=true],textarea")',
  ]);
  const errors = (await ab(browser, ["errors"])).errors;
  assert.deepEqual(errors, []);
  await ab(browser, ["screenshot", resolve(artifacts, "official-mobile-restored.png")]);
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        upstream: "3.17.2",
        route: "/remote/v4",
        fragmentRemoved: true,
        existingSessionOpened: true,
        mobileViewport: [390, 844],
        reloadRestored: true,
        scriptErrors: 0,
      },
      null,
      2,
    ),
  );
  console.log("Official Web: QR authorization, existing session, mobile layout and reload passed");
} finally {
  if (opened) {
    try {
      await evaluate(
        browser,
        `(async()=>{const session=JSON.parse(localStorage.getItem('kayingcode-web-account:v2')||'null');if(session?.token)await fetch('/api/v1/account/logout',{method:'POST',headers:{authorization:'Bearer '+session.token}});localStorage.clear();return true})()`,
      );
    } finally {
      await ab(browser, ["close"]);
    }
  }
}
