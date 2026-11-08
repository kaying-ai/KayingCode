// Opens the product site inside the running Electron renderer and screenshots it.
// node apps/kayingcode-site/tools/cdp-open-site.mjs [out.png] [scrollY | "top"]

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const outFile =
  process.argv[2] || fileURLToPath(new URL("../assets/site-preview.png", import.meta.url));
const scrollArg = process.argv[3] || "0";
const scroll = Number(scrollArg);
const waitMs = Number(process.argv[4] || 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch("http://127.0.0.1:9229/json/list")).json();
const page =
  targets.find((t) => t.type === "page" && t.url.includes("5174")) ||
  targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: new URL("../index.html", import.meta.url).href });
await sleep(waitMs);

if (scroll) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${scroll})` });
  await sleep(1200);
}

const shot = await Promise.race([
  send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: false,
  }),
  new Promise((_, rej) => setTimeout(() => rej(new Error("captureScreenshot timed out")), 25000)),
]);
await writeFile(outFile, Buffer.from(shot.data, "base64"));
console.log("saved", outFile);
process.exit(0);
