import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const ts = require("typescript");

const source = await readFile(new URL("../src/main/aboutWindow.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
});
const moduleExports = {};
runInNewContext(outputText, { exports: moduleExports, module: { exports: moduleExports } });

const icon = await readFile(new URL("../build/icon.png", import.meta.url));
const html = moduleExports.createCustomAboutDialogHtml({
  applicationName: "KayingCode Desktop App",
  appVersion: "0.1.0",
  copyright: "版权所有 © 2026 KayingCode。",
  optimizationLine: "",
  versionLabel: "版本",
  okButtonLabel: "确定",
  iconDataUrl: `data:image/png;base64,${icon.toString("base64")}`,
});
const aboutUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

const browser = await chromium.launch({
  channel:
    process.env.KAYINGCODE_E2E_BROWSER_CHANNEL ??
    (process.platform === "win32" ? "msedge" : "chrome"),
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 288, height: 312 } });
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await page.goto(aboutUrl);
    const presentation = await page.evaluate(() => {
      const panel = document.querySelector(".about-card");
      const image = document.querySelector(".app-icon");
      const button = document.querySelector(".ok-button");
      const bounds = panel.getBoundingClientRect();
      return {
        panelBackground: getComputedStyle(panel).backgroundColor,
        panelBorder: getComputedStyle(panel).borderTopColor,
        imageLoaded: image.complete && image.naturalWidth > 0,
        buttonBackground: getComputedStyle(button).backgroundColor,
        bounds: { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom },
      };
    });
    assert.equal(presentation.imageLoaded, true);
    assert.notEqual(presentation.panelBackground, "rgba(0, 0, 0, 0)");
    assert.notEqual(presentation.panelBorder, presentation.panelBackground);
    assert.ok(presentation.bounds.x > 0 && presentation.bounds.right < 288);
    assert.ok(presentation.bounds.y > 0 && presentation.bounds.bottom < 312);
    assert.notEqual(presentation.buttonBackground, presentation.panelBackground);
  }

  await page.evaluate(() => {
    window.aboutClosed = false;
    window.close = () => {
      window.aboutClosed = true;
    };
  });
  await page.getByRole("button", { name: "确定" }).click();
  assert.equal(await page.evaluate(() => window.aboutClosed), true);

  for (const key of ["Escape", "Enter"]) {
    await page.evaluate(() => {
      window.aboutClosed = false;
    });
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.aboutClosed), true);
  }

  console.log("PASS About E2E: themes, app icon, visible panel, and close controls");
} finally {
  await browser.close();
}
