import { win32 } from "node:path";
import { resolveHostTarCommand } from "./tarCommand.js";

export interface NodeArchiveExtractRequest {
  archivePath: string;
  /** 归档内成员路径，例如 `node-v22.16.0-linux-x64/bin/node`。 */
  memberPath: string;
  stripComponents: number;
  destinationDir: string;
  /** 非 Windows 宿主沿用调用方的 cwd；Windows 会切到归档所在目录。 */
  cwd: string;
  /** 测试注入用；缺省按宿主平台解析 tar 实现。 */
  tarCommand?: string;
}

export interface NodeArchiveExtractCommand {
  command: string;
  args: string[];
  cwd: string;
}

/**
 * 构造 Node 运行时归档的解包命令。
 *
 * Bug 原因：Windows 上的 Git Bash 会把 `-f C:\...` 的盘符当成远程主机
 * （`tar (child): Cannot connect to C: resolve failed`），导致 stage 在下载完
 * Node dist 后直接失败。与 `scripts/prepare-prebuilds.mjs` 的既有修复保持一致：
 * 切到归档所在目录，用相对文件名传 `-f`，并把 `-C` 目标统一写成正斜杠，
 * 避免 MSYS 参数转换改写反斜杠。非 Windows 宿主行为保持原样。
 */
export function buildNodeArchiveExtractCommand(
  request: NodeArchiveExtractRequest,
  platform: NodeJS.Platform = process.platform,
): NodeArchiveExtractCommand {
  const command = request.tarCommand ?? resolveHostTarCommand();
  if (platform !== "win32") {
    return {
      command,
      args: [
        "-xJf",
        request.archivePath,
        `--strip-components=${request.stripComponents}`,
        "-C",
        request.destinationDir,
        request.memberPath,
      ],
      cwd: request.cwd,
    };
  }
  return {
    command,
    args: [
      // Windows 使用系统自带 bsdtar：按魔数自动识别压缩格式，不依赖 -J。
      "-xf",
      // Bug 原因：这里处理的一定是 Windows 路径，但 `node:path` 的 basename/dirname
      // 跟随宿主平台。在 macOS/Linux 上 basename 会返回整串、dirname 返回 "."，
      // 导致测试（伪造 win32 平台）与跨平台预构建全部错位。固定用 win32 语义。
      win32.basename(request.archivePath),
      `--strip-components=${request.stripComponents}`,
      "-C",
      request.destinationDir.replaceAll("\\", "/"),
      request.memberPath,
    ],
    cwd: win32.dirname(request.archivePath),
  };
}
