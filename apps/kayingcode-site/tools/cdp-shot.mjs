// Drives the KayingCode Electron renderer through its DevTools protocol (port 9229)
// so we can capture real UI screenshots without OS dialogs in the frame.
//
// Usage:
//   node apps/kayingcode-site/tools/cdp-shot.mjs info
//   node apps/kayingcode-site/tools/cdp-shot.mjs shot apps/kayingcode-site/assets/x.png --wait 2500
//   node apps/kayingcode-site/tools/cdp-shot.mjs shot apps/kayingcode-site/assets/y.png --x 120 --y 520
//   node apps/kayingcode-site/tools/cdp-shot.mjs eval "document.body.innerText.slice(0,600)"

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const HOST = "127.0.0.1:9229";

async function listTargets() {
  const res = await fetch(`http://${HOST}/json/list`);
  return res.json();
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled") {
        this.logs.push(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }

  async shot(path, { format = "png", quality, fromSurface = false } = {}) {
    const params = { format, captureBeyondViewport: false, fromSurface };
    if (format === "jpeg" && quality) params.quality = quality;
    const r = await this.send("Page.captureScreenshot", params);
    await writeFile(path, Buffer.from(r.data, "base64"));
    return path;
  }
}

export async function attach(matchHint = "") {
  const targets = await listTargets();
  const page = targets.find(
    (t) => t.type === "page" && t.webSocketDebuggerUrl && t.url.includes(matchHint),
  );
  if (!page)
    throw new Error(
      `no page target matching ${matchHint}: ${JSON.stringify(targets.map((t) => [t.type, t.url]))}`,
    );
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return cdp;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const opts = {};
  const positional = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[i + 1];
    else positional.push(argv[i]);
  }
  const hint = opts.hint || "5174";
  const cdp = await attach(hint);
  if (opts.wait) await sleep(Number(opts.wait));

  if (command === "info") {
    console.log(
      JSON.stringify(await cdp.evaluate("[innerWidth, innerHeight, location.href]"), null, 1),
    );
    console.log(await cdp.evaluate("document.body.innerText.slice(0, 1500)"));
    return;
  }

  if (command === "eval") {
    const out = await cdp.evaluate(positional[0]);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 1));
    return;
  }

  if (command === "shot") {
    const path = positional[0];
    if (opts.x && opts.y) {
      const { x, y } = { x: Number(opts.x), y: Number(opts.y) };
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await cdp.send("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: "left",
          clickCount: 1,
          buttons: type === "mouseReleased" ? 0 : 1,
        });
        await sleep(60);
      }
      await sleep(Number(opts.after ?? 1800));
    }
    await cdp.shot(path);
    console.log("saved", path);
    return;
  }

  throw new Error(`unknown command ${command}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
