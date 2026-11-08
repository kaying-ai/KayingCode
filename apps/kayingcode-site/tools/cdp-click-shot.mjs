// Click a point in the Electron renderer and capture the resulting view.
// node apps/kayingcode-site/tools/cdp-click-shot.mjs <out.png> <x> <y> [afterMs]

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const [outFile, xArg, yArg, afterArg] = process.argv.slice(2);
const x = Number(xArg);
const y = Number(yArg);
const after = Number(afterArg ?? 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch("http://127.0.0.1:9229/json/list")).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("5174"));
if (!page) throw new Error("renderer target not found");

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.once("open", res);
  ws.once("error", rej);
});

let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid);
        reject(new Error(`${method} timed out`));
      }
    }, 20000);
  });

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);

await send("Page.enable");
await send("Runtime.enable");

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x,
  y,
  button: "left",
  buttons: 1,
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x,
  y,
  button: "left",
  buttons: 0,
  clickCount: 1,
});
console.log("clicked", x, y);

await sleep(after);

const shot = await withTimeout(
  send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: false,
  }),
  25000,
  "captureScreenshot",
);
await writeFile(outFile, Buffer.from(shot.data, "base64"));
console.log("saved", outFile);
process.exit(0);
