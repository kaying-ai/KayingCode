import assert from "node:assert/strict";
import test from "node:test";
import { parseEntryStoreListing } from "../src/plugins/marketplace.js";

test("marketplace listing keeps valid game metadata and drops only malformed extensions", () => {
  const gameDevelopment = { engines: ["threejs"], stages: ["publishing"] };
  assert.deepEqual(parseEntryStoreListing({ displayName: "Game", gameDevelopment }), {
    displayName: "Game",
    gameDevelopment,
  });
  assert.deepEqual(
    parseEntryStoreListing({ displayName: "Game", gameDevelopment: { engines: ["bad"] } }),
    { displayName: "Game" },
  );
});
