import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const WORKSPACE_IDENTITY_FILES = [
  "packages/shared/src/remote-workspace-identity.ts",
  "packages/shared/src/remoteAgentTarget.ts",
];
const upstreamIdentitySha256 = "ba5775c8146d633861d683ca411f25014986822c18207f24f080a2257afe1766";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function applyWorkspaceIdentity({ stage, repoRoot }) {
  // 上游 Web 只认识 remote:，收到 Host 的 remote-agent: 目录记录时会在渲染期抛错。
  // 复用桌面的纯身份模块，避免 Web 与 Host 分别定义标识编码和归属规则。
  const upstream = await readFile(resolve(stage, WORKSPACE_IDENTITY_FILES[0]));
  // Git archive 在 Windows 会按配置导出 CRLF；校验源码内容时以固定提交的 LF 为准。
  if (hash(upstream.toString("utf8").replaceAll("\r\n", "\n")) !== upstreamIdentitySha256) {
    throw new Error("Upstream workspace identity changed; review the compatibility overlay");
  }
  return Promise.all(
    WORKSPACE_IDENTITY_FILES.map(async (path, index) => {
      const contents = await readFile(resolve(repoRoot, path));
      await writeFile(resolve(stage, path), contents);
      return {
        path,
        upstreamSha256: index === 0 ? hash(upstream) : null,
        sha256: hash(contents),
      };
    }),
  );
}
