import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = import.meta.dirname;
const publicFiles = new Set(["/index.html", "/site.css", "/site.js", "/content.js"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const isWithinSite = (file) => {
  const path = relative(root, file);
  return !path.startsWith("..") && !isAbsolute(path);
};

export function createSiteServer() {
  return createServer(async (request, response) => {
    const send = (status, text) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(text);
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      send(405, "Method not allowed");
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      send(400, "Bad request");
      return;
    }
    if (path === "/") path = "/index.html";
    const file = resolve(root, `.${path}`);
    const isAsset =
      path.startsWith("/assets/") && [".png", ".webp", ".svg"].includes(extname(path));
    if (!isWithinSite(file) || (!publicFiles.has(path) && !isAsset)) {
      send(404, "Not found");
      return;
    }
    try {
      // 预览资源也校验真实路径，防止资源目录中的符号链接越过站点边界。
      if (!isWithinSite(await realpath(file))) {
        send(404, "Not found");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)],
        "Content-Length": body.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      send(
        error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500,
        error.code === "ENOENT" || error.code === "EISDIR" ? "Not found" : "Unable to read asset",
      );
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createSiteServer();
  const port = Number(process.env.KAYINGCODE_SITE_PORT ?? 4173);
  server.listen(port, "127.0.0.1", () =>
    console.log(`KayingCode product site: http://127.0.0.1:${server.address().port}`),
  );
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
}
