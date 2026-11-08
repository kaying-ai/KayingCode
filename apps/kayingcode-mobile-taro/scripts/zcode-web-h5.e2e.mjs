import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../dist/h5/", import.meta.url));
const artifacts = fileURLToPath(new URL("../../../.tmp/taro-zcode-web-e2e/", import.meta.url));
const fixtureUrl =
  "https://zcode-web.test/remote/v4?sid=test-device&name=Test%20PC&app_version=3.16.3";
const session = `taro-zcode-web-${process.pid}`;

async function findBrowser() {
  if (process.env.AGENT_BROWSER_BIN) return process.env.AGENT_BROWSER_BIN;
  if (process.platform !== "win32") return "agent-browser";
  const { stdout } = await exec("where.exe", ["agent-browser"]);
  for (const shim of stdout.trim().split(/\r?\n/)) {
    const binary = shim.endsWith(".exe")
      ? shim
      : join(dirname(shim), "node_modules/agent-browser/bin/agent-browser-win32-x64.exe");
    try {
      await access(binary);
      return binary;
    } catch {
      /* 检查下一个安装位置。 */
    }
  }
  throw new Error("请将 AGENT_BROWSER_BIN 指向 agent-browser 原生可执行文件。");
}

const browser = await findBrowser();
await access(join(root, "index.html"));
await mkdir(artifacts, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};
const server = createServer(async (request, response) => {
  try {
    let file = resolve(root, `.${new URL(request.url, "http://localhost").pathname}`);
    if (file !== resolve(root) && !file.startsWith(`${resolve(root)}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = join(root, "index.html");
    } catch {
      file = join(root, "index.html");
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const base = `http://127.0.0.1:${server.address().port}`;

async function ab(...args) {
  const { stdout } = await exec(browser, ["--session", session, "--json", ...args], {
    timeout: 35_000,
    maxBuffer: 2_000_000,
  });
  const result = JSON.parse(stdout.trim());
  if (!result.success) throw new Error(result.error);
  return result.data;
}
async function evaluate(source) {
  return (await ab("eval", "-b", Buffer.from(source).toString("base64"))).result;
}
async function click(text) {
  await ab("find", "text", text, "click", "--exact");
}
async function waitFor(source) {
  await ab("wait", "--fn", source);
}

async function seed(theme) {
  await ab("open", `${base}/pages/home/index`);
  await evaluate(`localStorage.clear();
    localStorage.setItem('zflow_theme_mode', JSON.stringify({data:${JSON.stringify(theme)}}));
    localStorage.setItem('kayingcode-mobile-accounts:v1', JSON.stringify({data:JSON.stringify([{id:'test-zcode',label:'Test PC',backendType:'zcode',url:${JSON.stringify(fixtureUrl)},addedAt:1,lastUsedAt:null}])}));`);
  await ab("open", `${base}/pages/home/index`);
  await waitFor("document.querySelector('.bot-card-title')?.textContent==='Test PC'");
  await evaluate(`window.__shellCalls=[];
    const originalFetch=window.fetch;
    window.fetch=(url,...args)=>{window.__shellCalls.push(String(url));return originalFetch(url,...args);};
    const originalOpen=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method,url,...args){window.__shellCalls.push(String(url));return originalOpen.call(this,method,url,...args);};
    const OriginalSocket=window.WebSocket;
    window.WebSocket=class extends OriginalSocket {constructor(url,...args){window.__shellCalls.push(String(url));super(url,...args);}};`);
}

async function assertFrame() {
  await waitFor("document.querySelector('.zcode-web-content iframe') !== null");
  // 等待真实页面动画结束，再检查溢出；不以固定延时掩盖布局或导航错误。
  await waitFor(
    "Math.abs(document.querySelector('iframe').getBoundingClientRect().left)<0.1 && document.documentElement.scrollWidth<=innerWidth",
  );
  const result = await evaluate(
    `(()=>{const frames=[...document.querySelectorAll('iframe')];const frame=frames[0];const box=frame.getBoundingClientRect();return {path:location.pathname,query:location.search,count:frames.length,src:frame.src,top:box.top,width:box.width,viewport:innerWidth};})()`,
  );
  assert.equal(result.path, "/pages/zcode-web/index");
  assert.equal(result.query, "?accountId=test-zcode");
  assert.equal(result.count, 1);
  assert.equal(result.src, fixtureUrl);
  assert.ok(result.top < 140, `toolbar too tall: ${result.top}`);
  assert.ok(Math.abs(result.width - result.viewport) < 2);
  assert.deepEqual(await evaluate("window.__shellCalls"), []);
  assert.equal(await evaluate("document.body.textContent.includes('登录 ZCode')"), false);
}

async function back() {
  await click("返回");
  await waitFor("location.pathname==='/pages/home/index' && !document.querySelector('iframe')");
}

try {
  await ab("open", base);
  await ab(
    "network",
    "route",
    "https://zcode-web.test/**",
    "--body",
    '{"fixture":"ZCode webpage"}',
  );
  for (const width of [320, 375])
    for (const theme of ["dark", "light"]) {
      await ab("set", "viewport", String(width), "812");
      await seed(theme);
      await click("Test PC");
      await assertFrame();
      await evaluate('window.__previousFrame=document.querySelector("iframe")');
      await click("刷新");
      await waitFor(
        'document.querySelector("iframe") && document.querySelector("iframe")!==window.__previousFrame',
      );
      await assertFrame();
      await ab("screenshot", join(artifacts, `${width}-${theme}.png`));
      await evaluate(
        "window.__oldWebview=document.querySelector('taro-web-view-core');window.__oldWebview.dispatchEvent(new CustomEvent('error',{detail:{src:'fixture'},bubbles:true}));",
      );
      await waitFor(
        "document.body.textContent.includes('网页未能加载') && !document.querySelector('iframe')",
      );
      await evaluate(
        "window.__oldWebview.dispatchEvent(new CustomEvent('load',{detail:{src:'fixture'},bubbles:true}));",
      );
      assert.equal(await evaluate('!!document.querySelector("iframe")'), false);
      await click("重新加载");
      await assertFrame();
      await back();
      await click("Test PC");
      await assertFrame();
      await back();
      await click("会话");
      await click("打开官方网页");
      await assertFrame();
      await back();
      await ab("open", `${base}/pages/device/index`);
      await waitFor("document.body.textContent.includes('打开网页')");
      await click("打开网页");
      await waitFor("document.querySelector('iframe')!==null");
      assert.equal(await evaluate('document.querySelector("iframe").src'), fixtureUrl);
      console.log(
        `PASS ${width}px ${theme}: 三入口、原始 URL、刷新、错误/迟到事件、重试、返回再开、无原生请求`,
      );
    }
  await ab("open", `${base}/pages/zcode-web/index?accountId=deleted`);
  await waitFor("document.body.textContent.includes('连接信息已失效')");
  assert.equal(await evaluate('!!document.querySelector("iframe")'), false);
  console.log("PASS 已删除档案不加载 iframe；截图位于根 .tmp/taro-zcode-web-e2e/");
} finally {
  await ab("close").catch(() => undefined);
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
