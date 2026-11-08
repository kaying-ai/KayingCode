import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const manifest = async (path) => JSON.parse(await read(path));

test("public product version is consistent across manifests", async () => {
  const [product, cli, taro, flutter, flutterDisplay] = await Promise.all([
    manifest("package.json"),
    manifest("apps/zcode-cli/packages/cli/package.json"),
    manifest("apps/kayingcode-mobile-taro/package.json"),
    read("apps/kayingcode-mobile-flutter/pubspec.yaml"),
    read("apps/kayingcode-mobile-flutter/lib/update/app_version.dart"),
  ]);
  // 固定首发版本会使后续版本无法通过，改用根清单作为各端展示版本的基准。
  assert.match(product.version, /^\d+\.\d+\.\d+$/u);
  assert.equal(cli.version, product.version, "CLI product version");
  assert.equal(taro.version, product.version, "Taro product version");
  const flutterVersion = flutter.match(/^version: (\d+\.\d+\.\d+)\+[1-9]\d*$/mu);
  assert.ok(flutterVersion, "Flutter version must include a positive build number");
  assert.equal(flutterVersion[1], product.version, "Flutter product version");
  assert.equal(
    flutterDisplay.match(/defaultValue: '([^']+)'/u)?.[1],
    product.version,
    "Flutter display version",
  );
});

test("official plugin manifests retain matching independent release versions", async () => {
  const catalog = await manifest("config/official-plugins.json");
  for (const plugin of catalog.plugins) {
    const sourceRoot = plugin.sourceRoot;
    const [pkg, definition] = await Promise.all([
      manifest(`${sourceRoot}/package.json`),
      manifest(`${sourceRoot}/.kayingcode-plugin/plugin.json`),
    ]);
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, `${sourceRoot}/package.json`);
    assert.equal(definition.version, pkg.version, `${sourceRoot}/plugin.json`);
  }
});

test("native installation identities use the new product id", async () => {
  const appId = "com.lingdian.kayingai.agent.code";
  const android = await read("apps/kayingcode-mobile-flutter/android/app/build.gradle.kts");
  const ios = await read("apps/kayingcode-mobile-flutter/ios/Runner.xcodeproj/project.pbxproj");
  assert.match(android, new RegExp(`namespace = "${appId.replaceAll(".", "\\.")}"`, "u"));
  assert.match(android, new RegExp(`applicationId = "${appId.replaceAll(".", "\\.")}"`, "u"));
  assert.equal(
    (
      ios.match(new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${appId.replaceAll(".", "\\.")};`, "gu")) ??
      []
    ).length,
    3,
  );
  assert.equal(
    (
      ios.match(
        new RegExp(
          `PRODUCT_BUNDLE_IDENTIFIER = ${appId.replaceAll(".", "\\.")}\\.RunnerTests;`,
          "gu",
        ),
      ) ?? []
    ).length,
    3,
  );

  const kotlinRoot =
    "apps/kayingcode-mobile-flutter/android/app/src/main/kotlin/com/lingdian/kayingai/agent/code";
  const kotlinFiles = (await readdir(resolve(root, kotlinRoot))).filter((name) =>
    name.endsWith(".kt"),
  );
  assert.equal(kotlinFiles.length, 3);
  for (const file of kotlinFiles) {
    assert.match(
      await read(`${kotlinRoot}/${file}`),
      /^package com\.lingdian\.kayingai\.agent\.code$/mu,
    );
  }
});
