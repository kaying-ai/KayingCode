import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { hashBytes } from "./third-party-npm.mjs";

const root = resolve(import.meta.dirname, "..");
const reviews = JSON.parse(await readFile(resolve(root, "third-party/npm-overrides.json"), "utf8"));
const review = reviews.find((item) => item.package === "react-remove-scroll-bar@2.3.8");
assert.ok(review?.reviewEvidence?.reproduction, "Missing exact-version source evidence");
const evidence = review.reviewEvidence;
assert.equal(ts.version, evidence.reproduction.transpiler.version, "Transpiler version changed");
const directory = resolve(root, "node_modules/react-remove-scroll-bar");
const pkg = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
assert.equal(`${pkg.name}@${pkg.version}`, review.package);
for (const file of [review, ...evidence.files]) {
  assert.equal(hashBytes(await readFile(resolve(root, file.file))), file.sha256, file.file);
}

function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const result = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan())
    result.push([token, scanner.getTokenValue() ?? scanner.getTokenText()]);
  return result;
}

let checked = 0;
for (const file of ["index.ts", "component.tsx", "constants.ts", "utils.ts"]) {
  const source = evidence.files.find((item) => item.source.endsWith(`/src/${file}`));
  assert.ok(source, `Missing licensed implementation: ${file}`);
  const text = await readFile(resolve(root, source.file), "utf8");
  for (const [format, module, target] of [
    ["es5", ts.ModuleKind.CommonJS, ts.ScriptTarget.ES5],
    ["es2015", ts.ModuleKind.ES2015, ts.ScriptTarget.ES5],
    ["es2019", ts.ModuleKind.ES2015, ts.ScriptTarget.ES2019],
  ]) {
    const member = `dist/${format}/${file.replace(/\.tsx?$/u, ".js")}`;
    const expected = evidence.reproduction.outputs.find((item) => item.member === member);
    assert.ok(expected, `Missing output identity: ${member}`);
    const installed = await readFile(resolve(directory, member));
    assert.equal(
      hashBytes(installed),
      expected.sha256,
      `Installed implementation changed: ${member}`,
    );
    const output = ts.transpileModule(text, {
      fileName: file,
      compilerOptions: { module, target, jsx: ts.JsxEmit.React, importHelpers: true },
    }).outputText;
    // 发布版本缺少可解析提交；严格比较全部实现，不能用作者字段或近似版本推定通知适用。
    assert.deepEqual(tokens(output), tokens(installed.toString("utf8")), member);
    checked++;
  }
}
assert.equal(checked, evidence.reproduction.outputs.length);
console.log(`Licensed source identity verified: ${review.package}, ${checked} JavaScript outputs`);
