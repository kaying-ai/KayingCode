import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

async function loadAboutWindow() {
  const source = await readFile(new URL("../src/main/aboutWindow.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const moduleExports = {};
  runInNewContext(outputText, {
    exports: moduleExports,
    module: { exports: moduleExports },
    require,
    process,
    console,
  });
  return moduleExports;
}

test("About 使用应用图标和本地化版本信息", async () => {
  const { createCustomAboutDialogHtml } = await loadAboutWindow();
  const iconDataUrl = "data:image/png;base64,aGVsbG8=";
  const html = createCustomAboutDialogHtml({
    applicationName: "KayingCode Desktop App",
    appVersion: "0.1.0",
    copyright: "版权所有 © 2026 KayingCode。",
    optimizationLine: "已针对 Apple Silicon 优化。",
    versionLabel: "版本",
    okButtonLabel: "确定",
    iconDataUrl,
  });

  assert.match(html, /KayingCode Desktop App/);
  assert.match(html, /版本 0\.1\.0/);
  assert.match(html, /<img[^>]+src="data:image\/png;base64,aGVsbG8="/);
  assert.doesNotMatch(html, /<svg/);
});

test("About 转义传入的图标地址和文字", async () => {
  const { createCustomAboutDialogHtml } = await loadAboutWindow();
  const html = createCustomAboutDialogHtml({
    applicationName: '<img src=x onerror="alert(1)">',
    appVersion: "0.1.0",
    copyright: "KayingCode",
    optimizationLine: "",
    versionLabel: "version",
    okButtonLabel: "OK",
    iconDataUrl: 'data:image/png;base64,foo" onerror="alert(1)',
  });

  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /src="data:image\/png;base64,foo&quot; onerror=&quot;alert\(1\)/);
});
