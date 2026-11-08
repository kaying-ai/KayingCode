import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const forbiddenPath = (path) => {
  // 签名 JSON 含 PFX 口令，即使误放在非运行时目录也必须拦截。
  if (/(?:^|\/)windows-signing\.local\.json$/iu.test(path)) return "local signing configuration";
  if (/^\.workbuddy(?:-ai)?\/memory\//u.test(path)) return "internal memory";
  if (/^docs\/kaying\/brains\//u.test(path)) return "internal planning";
  if (
    /^(?:design-qa\.md|docs\/(?:package-build\.20261001|opensource\.20261005)\.md)$/u.test(path)
  ) {
    return "internal review";
  }
  if (/(?:^|\/)\.env(?:\.[^/]*)?$/u.test(path) && !/\.env\.(?:example|template)$/u.test(path)) {
    return "environment file";
  }
  if (/\.(?:pfx|p12|pem|key|keystore|jks|har|pcap|pcapng)$/iu.test(path)) {
    return "credential or capture file";
  }
  return null;
};

const { stdout: rawPaths } = await execFileAsync("git", ["ls-files", "--cached", "-z"], {
  encoding: "buffer",
  maxBuffer: 20 * 1024 * 1024,
});
const failures = rawPaths
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .flatMap((path) => {
    const reason = forbiddenPath(path);
    return reason ? [`${path}: ${reason}`] : [];
  });

try {
  const { stdout } = await execFileAsync(
    "git",
    [
      "grep",
      "--cached",
      "-l",
      "-I",
      "-E",
      "--",
      "-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----",
    ],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  failures.push(
    ...stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((path) => `${path}: private key marker`),
  );
} catch (error) {
  if (error.code !== 1) throw error;
}

if (failures.length > 0) {
  process.stderr.write(`Public snapshot rejected:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("public snapshot path and private-key marker check: OK\n");
}
