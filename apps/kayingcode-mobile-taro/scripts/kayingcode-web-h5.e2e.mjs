import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../dist/h5/", import.meta.url));
const artifacts = fileURLToPath(new URL("../../../.tmp/taro-kayingcode-web-e2e/", import.meta.url));
let fixtureUrl;
let inputUrl;
const session = `taro-kayingcode-web-${process.pid}`;

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
inputUrl = `https://web-fixture.test/remote/v4?sid=test-desktop&name=Test%20PC#authorize=${"A".repeat(43)}`;
const entry = new URL(inputUrl);
entry.searchParams.set("kayingShell", "1");
entry.searchParams.set("kayingParentOrigin", base);
fixtureUrl = entry.href;

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
    localStorage.setItem('kayingcode-mobile-accounts:v1', JSON.stringify({data:JSON.stringify([{id:'test-kayingcode',label:'Test PC',backendType:'kayingcode',url:${JSON.stringify(inputUrl)},addedAt:1,lastUsedAt:null}])}));`);
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
  assert.equal(result.query, "?accountId=test-kayingcode");
  assert.equal(result.count, 1);
  assert.equal(
    new URL(result.src).searchParams.toString(),
    new URL(fixtureUrl).searchParams.toString(),
  );
  assert.equal(new URL(result.src).hash, new URL(fixtureUrl).hash);
  assert.ok(result.top < 72, `toolbar too tall: ${result.top}`);
  assert.equal(await evaluate("document.querySelector('.zcode-web-title').textContent"), "Test PC");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('.zcode-web-toolbar button,.zcode-web-toolbar taro-button-core')).some(button => button.textContent.trim() === '返回')",
    ),
    false,
  );
  assert.ok(Math.abs(result.width - result.viewport) < 2);
  const calls = await evaluate("window.__shellCalls");
  assert.equal(calls.length, 0, "Web 容器不能发现旧配置、claim 或创建 socket");
  assert.equal(await evaluate("document.body.textContent.includes('登录 ZCode')"), false);
}

async function back() {
  await click("关闭");
  await waitFor("location.pathname==='/pages/home/index' && !document.querySelector('iframe')");
}

try {
  await ab("open", base);
  await evaluate("localStorage.clear();");
  await ab("open", `${base}/pages/home/index`);
  await waitFor("document.body.textContent.includes('连接 KayingCode')");
  assert.equal(await evaluate("document.body.textContent.includes('完整 V2 授权链接')"), true);
  assert.equal(await evaluate("document.body.textContent.includes('配对码')"), false);
  await ab("open", `${base}/pages/device/index`);
  await waitFor("document.querySelector('.device-add')!==null");
  await ab("click", ".device-add");
  await click("粘贴链接添加");
  await waitFor("document.querySelector('textarea')!==null");
  assert.equal(await evaluate("document.body.textContent.includes('完整 V2 授权链接')"), true);
  assert.equal(
    await evaluate("document.querySelector('textarea').placeholder"),
    "https://…/remote/v4?sid=…#authorize=…",
  );
  await ab(
    "network",
    "route",
    "https://web-fixture.test/**",
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
      await click("Test PC");
      await assertFrame();
      await back();
      await ab("open", `${base}/pages/device/index`);
      await waitFor("document.body.textContent.includes('打开网页')");
      await click("打开网页");
      await waitFor("document.querySelector('iframe')!==null");
      assert.equal(
        new URL(await evaluate('document.querySelector("iframe").src')).searchParams.toString(),
        new URL(fixtureUrl).searchParams.toString(),
      );
      console.log(
        `PASS ${width}px ${theme}: 三入口、完整 V2 URL、刷新、错误/迟到事件、重试、返回再开，无原生协议请求`,
      );
    }
  await seed("dark");
  await click("Test PC");
  await assertFrame();
  await click("更多");
  await waitFor(
    "document.querySelector('.taro__actionSheet')?.textContent.includes('在浏览器打开') && document.querySelector('.taro__actionSheet')?.textContent.includes('复制链接')",
  );
  await ab("click", ".taro__actionSheet > div:first-child");
  await waitFor(
    "getComputedStyle(document.querySelector('.taro__actionSheet')).display === 'none'",
  );
  await assertFrame();
  // 来源必须是当前 iframe；父页面伪造的同形消息不能写入最近项目。
  await evaluate(
    `window.postMessage({type:'kayingcode.project-opened.v1',workspacePath:'/forged'},location.origin)`,
  );
  await evaluate(
    `(()=>{const frame=document.querySelector('iframe');window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:new URL(frame.src).origin,data:{type:'kayingcode.project-opened.v1',workspacePath:'/games/demo',workspaceIdentity:'host-a'}}));})()`,
  );
  await waitFor("localStorage.getItem('mobileRecentProjectsV1')?.includes('/games/demo')");
  await back();
  await click("项目列表");
  await waitFor("document.body.textContent.includes('demo')");
  assert.equal(await evaluate("document.body.textContent.includes('/forged')"), false);
  await ab("screenshot", join(artifacts, "recent-projects.png"));
  await click("demo");
  await waitFor("document.querySelector('iframe')!==null");
  assert.equal(
    new URL(await evaluate('document.querySelector("iframe").src')).searchParams.get(
      "kayingWorkspace",
    ),
    "host-a",
  );
  console.log("PASS 最近项目保存、来源隔离、列表恢复与项目导航");

  await ab("set", "viewport", "320", "812");
  await seed("light");
  const latestPath = "D:\\code\\game";
  await evaluate(`(() => {
    const accountKey = 'kayingcode-mobile-accounts:v1';
    const account = JSON.parse(JSON.parse(localStorage.getItem(accountKey)).data)[0];
    localStorage.setItem(accountKey, JSON.stringify({data: JSON.stringify([account, {...account, id:'other', label:'Build PC'}])}));
    const base = {accountId: account.id, deviceSid:'test-desktop'};
    localStorage.setItem('mobileRecentProjectsV1', JSON.stringify({data:[
      {...base, workspacePath:'D:/code/game', lastUsedAt:1},
      {...base, workspacePath:${JSON.stringify(latestPath)}, lastUsedAt:4},
      {...base, workspacePath:'/workspaces/projects/a-very-long-directory-name-that-needs-to-wrap', lastUsedAt:2},
      {...base, accountId:'other', workspacePath:'/home/build/tools', lastUsedAt:3}
    ]}));
  })()`);
  await ab("open", `${base}/pages/home/index`);
  await click("项目列表");
  await waitFor("document.querySelectorAll('.recent-project').length===3");
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('.recent-projects-device')].map(node=>node.textContent)",
    ),
    ["Test PC", "Build PC"],
  );
  assert.equal(
    await evaluate("document.querySelector('.recent-projects-count').textContent.trim()"),
    "3 个项目",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.recent-project-detail')].every(node=>node.scrollWidth<=node.clientWidth+1) && document.documentElement.scrollWidth<=innerWidth",
    ),
    true,
  );
  await ab("screenshot", join(artifacts, "recent-projects-320-light.png"));
  await ab("find", "first", ".recent-project", "click");
  await waitFor("document.querySelector('iframe')!==null");
  assert.equal(
    new URL(await evaluate('document.querySelector("iframe").src')).searchParams.get(
      "kayingWorkspace",
    ),
    latestPath,
  );
  console.log("PASS 320px 项目分组、长路径、旧记录别名与原始工作区键导航");

  inputUrl = "https://web-fixture.test#pair-test#secret-test";
  await seed("dark");
  await ab("open", `${base}/pages/zcode-web/index?accountId=test-kayingcode`);
  await waitFor("document.body.textContent.includes('连接信息已失效')");
  assert.equal(await evaluate('!!document.querySelector("iframe")'), false);
  console.log("PASS 旧协议档案不能创建 WebView 或旧 socket");
  await ab("open", `${base}/pages/zcode-web/index?accountId=deleted`);
  await waitFor("document.body.textContent.includes('连接信息已失效')");
  assert.equal(await evaluate('!!document.querySelector("iframe")'), false);
  console.log("PASS 已删除档案不加载 iframe；截图位于根 .tmp/taro-kayingcode-web-e2e/");
} finally {
  await ab("close").catch(() => undefined);
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
