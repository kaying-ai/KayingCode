import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const source = new URL(
  "../../../apps/zcode-cli/packages/visualize-plugin/skills/visualize/assets/",
  import.meta.url,
);

/** Inline 和导出共用实际资源文件，避免维护另一份有细节差异的运行时。 */
export async function copyGenUiRuntimeAssets(destination) {
  const manifest = JSON.parse(await readFile(new URL("vendor/manifest.json", source), "utf8"));
  const vendorFiles = new Map();
  for (const resource of manifest.resources) {
    vendorFiles.set(resource.file, resource.sha256);
    vendorFiles.set(resource.licenseFile, resource.licenseSha256);
  }
  // 离线运行依赖完整的固定快照；构建时发现缺失或漂移，不能把失败留到用户首次打开。
  await Promise.all(
    [...vendorFiles].map(async ([file, expectedHash]) => {
      if (!/^[a-zA-Z0-9.-]+$/.test(file)) throw new Error(`Invalid Gen UI vendor file: ${file}`);
      const bytes = await readFile(new URL(`vendor/${file}`, source));
      // manifest 记录的是 LF 规范字节的 sha256；Windows checkout（core.autocrlf=true）会把工作树
      // 转成 CRLF，直接对原始字节取哈希会误报漂移。这里先规范化换行再校验，语义不变。
      const canonical = bytes.includes(0x0d)
        ? Buffer.from(
            bytes.toString("utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)),
            "utf8",
          )
        : bytes;
      if (createHash("sha256").update(canonical).digest("hex") !== expectedHash)
        throw new Error(`Gen UI vendor hash mismatch: ${file}`);
    }),
  );
  await mkdir(destination, { recursive: true });
  await mkdir(join(destination, "vendor"), { recursive: true });
  await Promise.all(
    [
      "visualize.css",
      "visualize.html",
      "calendar.js",
      "vendor/manifest.json",
      ...[...vendorFiles.keys()].map((file) => `vendor/${file}`),
    ].map((file) => copyFile(new URL(file, source), join(destination, file))),
  );
}
