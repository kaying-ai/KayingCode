import assert from "node:assert/strict";
import test from "node:test";
import { verifyNativeSourceRelocation } from "./refresh-native-search-notice-inputs.mjs";

test("native notice inputs permit reviewed repository paths to move", () => {
  verifyNativeSourceRelocation(
    'dir="apps/kayingcode-cli/dependencies/native-search"; version="1"',
    'dir="apps/zcode-cli/packages/cli/dependencies/native-search"; version="1"',
  );
});

test("native notice inputs reject version changes even alongside a valid move", () => {
  assert.throws(
    () =>
      verifyNativeSourceRelocation(
        'dir="apps/kayingcode-desktop/bundled-tools"; version="1"',
        'dir="packages/desktop/bundled-tools"; version="2"',
      ),
    /changed beyond reviewed source relocation/,
  );
});
