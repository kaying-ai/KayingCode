import assert from "node:assert/strict";
import test from "node:test";
import {
  captureImageComposerTarget,
  registerImageComposerTarget,
} from "../src/image-preview-editor/composerTarget.js";

test("scope release rejects a captured image receiver instead of redirecting to another draft", () => {
  const events = new EventTarget();
  const received: string[] = [];
  const release = registerImageComposerTarget(
    { append: (file) => (received.push(`first:${file.name}`), true) },
    events,
  );
  const captured = captureImageComposerTarget(events);
  release();
  const releaseNext = registerImageComposerTarget(
    { append: (file) => (received.push(`next:${file.name}`), true) },
    events,
  );
  const image = new File(["png"], "annotation.png", { type: "image/png" });
  assert.equal(captured?.append(image), false);
  assert.deepEqual(received, []);
  assert.equal(captureImageComposerTarget(events)?.append(image), true);
  assert.deepEqual(received, ["next:annotation.png"]);
  releaseNext();
  assert.equal(captureImageComposerTarget(events), null);
});

test("attachment admission rejection is preserved", () => {
  const events = new EventTarget();
  const release = registerImageComposerTarget({ append: () => false }, events);
  assert.equal(
    captureImageComposerTarget(events)?.append(new File(["png"], "annotation.png")),
    false,
  );
  release();
});
