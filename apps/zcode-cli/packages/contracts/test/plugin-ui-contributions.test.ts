import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginUiContributions } from "../src/plugins/index.js";

const validContribution = {
  sidePanes: [
    {
      contractVersion: 1,
      id: "transcription-compare",
      kind: "browser-compare",
      title: "转写对比",
      publicationFile: ".maker/threejs-to-taptapmaker/compare-publication.v1.json",
      views: [
        { id: "source", label: "原版 Web", profile: "standard-web" },
        { id: "target", label: "TapTap 预览", profile: "taptap-preview" },
      ],
    },
  ],
};

test("parses a strict browser-compare contribution", () => {
  const result = parsePluginUiContributions(validContribution);
  assert.deepEqual(result.errors, []);
  assert.equal(result.contributions?.sidePanes[0]?.id, "transcription-compare");
});

test("rejects publication path escape and unknown host configuration", () => {
  const result = parsePluginUiContributions({
    sidePanes: [
      {
        ...validContribution.sidePanes[0],
        publicationFile: "../outside.json",
        partition: "persist:untrusted",
      },
    ],
  });
  assert.equal(result.contributions, undefined);
  assert.equal(result.errors.length, 1);
});

test("keeps the first unique contribution and rejects a duplicate id", () => {
  const result = parsePluginUiContributions({
    sidePanes: [validContribution.sidePanes[0], validContribution.sidePanes[0]],
  });
  assert.equal(result.contributions?.sidePanes.length, 1);
  assert.match(result.errors[0] ?? "", /duplicate contribution id/);
});
