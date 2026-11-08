import assert from "node:assert/strict";
import test from "node:test";
import {
  FrameStability,
  validateRegion,
  sampleFrame,
  preview,
} from "../runtime/image-observation.mjs";
import { run, pngDimensions } from "../runtime/io.mjs";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("motion cannot settle; three close frames must span real time", () => {
  const state = new FrameStability();
  assert.equal(state.push(Buffer.from([0, 0]), 0), false);
  assert.equal(state.push(Buffer.from([200, 200]), 200), false);
  assert.equal(state.push(Buffer.from([200, 200]), 300), false);
  assert.equal(state.push(Buffer.from([201, 200]), 450), true);
});
test("real region sampling ignores animation outside board; preview maps original pixels", async (t) => {
  try {
    await run("ffmpeg", ["-version"]);
  } catch {
    t.skip("ffmpeg unavailable");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "playtest-pixels-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "screenshots"));
  const frames = [];
  for (const color of ["white", "blue"]) {
    const path = join(root, `${color}.png`);
    await run("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:size=200x200",
      "-vf",
      `drawbox=x=0:y=0:w=100:h=200:color=${color}:t=fill`,
      "-frames:v",
      "1",
      path,
    ]);
    frames.push({ bytes: await readFile(path), width: 200, height: 200 });
  }
  const region = { x: 100, y: 0, width: 100, height: 200 };
  assert.deepEqual(
    await sampleFrame(run, root, frames[0], region),
    await sampleFrame(run, root, frames[1], region),
  );
  const reduced = await preview(run, join(root, "white.png"), frames[0], 100);
  assert.equal(reduced.preview.scaleX, 2);
  assert.deepEqual(pngDimensions(await readFile(reduced.previewImagePath)), {
    width: 100,
    height: 100,
  });
});
test("region validation happens before input and bounds refer to original pixels", () => {
  assert.throws(
    () => validateRegion({ x: 90, y: 0, width: 20, height: 10 }, { width: 100, height: 100 }),
    /bounds/,
  );
  assert.deepEqual(
    validateRegion({ x: 10, y: 20, width: 30, height: 40 }, { width: 100, height: 100 }),
    { x: 10, y: 20, width: 30, height: 40 },
  );
});
