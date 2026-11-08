import { cp, mkdir, rm, access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const from = fileURLToPath(new URL("../../../packages/web/dist/", import.meta.url));
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const to = join(publicDir, "remote");
const verification = "69txzPKb7q.txt";
const verificationSource = fileURLToPath(
  new URL(`../domain-verification/${verification}`, import.meta.url),
);
await access(join(from, "index.html"));
await access(verificationSource);
// 清除旧 admin 等构建残留，再从发布输入恢复 Web 和微信域名校验文件。
await rm(publicDir, { recursive: true, force: true });
await mkdir(to, { recursive: true });
// sourcemap 留在本地构建目录；大型 map 超过 Workers 单文件限制，不作为公开静态资源发布。
await cp(from, to, { recursive: true, force: true, filter: (source) => !source.endsWith(".map") });
await copyFile(verificationSource, join(publicDir, verification));
