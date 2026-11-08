import assert from "node:assert/strict";
import test from "node:test";
import { hashBytes } from "./third-party-npm.mjs";
import { readNpmOverrideEvidence } from "./generate-third-party-notices.mjs";

test("late publisher notices retain version-link evidence as hashed inventory inputs", async () => {
  const files = new Map([
    ["license.txt", Buffer.from("Publisher original notice")],
    ["source.js", Buffer.from("The exact version's original source")],
  ]);
  const record = {
    package: "example@1",
    file: "license.txt",
    reviewEvidence: {
      files: [{ file: "source.js", sha256: hashBytes(files.get("source.js")) }],
    },
  };
  const read = [];
  const readInput = async (file) => {
    read.push(file);
    if (!files.has(file)) throw new Error("missing material");
    return files.get(file);
  };
  await readNpmOverrideEvidence([record], readInput);
  assert.deepEqual(read, ["license.txt", "source.js"]);
  files.set("source.js", Buffer.from("different source"));
  await assert.rejects(
    readNpmOverrideEvidence([record], readInput),
    /Changed npm version evidence/,
  );
  files.delete("source.js");
  await assert.rejects(readNpmOverrideEvidence([record], readInput), /missing material/);
});
