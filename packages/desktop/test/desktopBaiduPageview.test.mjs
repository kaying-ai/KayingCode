import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const trackerUrl =
  "https://hm.baidu.com/hm.js?bbfa9a5147f2d8c3991fd670b65ea595";

test("desktop home inserts the Baidu script once before app startup, but update status skips it", async () => {
  const html = await readFile(
    new URL("../src/renderer/index.html", import.meta.url),
    "utf8",
  );
  const inlineScripts = [
    ...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
  ];
  const trackerScript = inlineScripts.find((match) =>
    match[1]?.includes(trackerUrl),
  );
  assert.ok(trackerScript, "desktop index should contain the Baidu bootstrap");
  assert.ok(trackerScript.index < html.indexOf('src="./src/main.tsx"'));

  const runTracker = (search) => {
    const inserted = [];
    const firstScript = {
      parentNode: {
        insertBefore(script, before) {
          assert.equal(before, firstScript);
          inserted.push(script);
        },
      },
    };
    const context = {
      URLSearchParams,
      window: { location: { search } },
      document: {
        createElement(tag) {
          assert.equal(tag, "script");
          return {};
        },
        getElementsByTagName(tag) {
          assert.equal(tag, "script");
          return [firstScript];
        },
      },
    };
    runInNewContext(trackerScript[1], context);
    return { inserted, queue: context._hmt };
  };

  const mainWindow = runTracker("");
  assert.deepEqual(
    mainWindow.inserted.map((script) => script.src),
    [trackerUrl],
  );
  assert.equal(Array.isArray(mainWindow.queue), true);
  assert.deepEqual(runTracker("?windowKind=update-status").inserted, []);
});
