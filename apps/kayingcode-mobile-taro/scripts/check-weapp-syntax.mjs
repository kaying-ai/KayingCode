import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const outputDir = fileURLToPath(new URL("../dist/weapp/", import.meta.url));
const scripts = (await readdir(outputDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => entry.name)
  .sort();

const failures = [];
const webviewPage = JSON.parse(
  await readFile(join(outputDir, "pages/zcode-web/index.json"), "utf8"),
);
if (webviewPage.navigationBarTitleText !== "KayingCode 工作台") {
  failures.push("pages/zcode-web/index.json: 微信导航栏标题应为「KayingCode 工作台」");
}
for (const name of scripts) {
  const source = await readFile(join(outputDir, name), "utf8");
  try {
    parse(source, { ecmaVersion: 2019, sourceType: "script" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error("[weapp build check] 产物校验失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[weapp build check] OK (${scripts.length} JavaScript files, ES2019, WebView title)`);
}
