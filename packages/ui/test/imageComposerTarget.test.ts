import { describe, expect, it } from "vitest";
import {
  captureImageComposerTarget,
  registerImageComposerTarget,
} from "@/image-preview-editor/composerTarget.js";

describe("image composer target", () => {
  it("scope release rejects a captured image receiver instead of redirecting to another draft", () => {
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
    expect(captured?.append(image)).toBe(false);
    expect(received).toEqual([]);
    expect(captureImageComposerTarget(events)?.append(image)).toBe(true);
    expect(received).toEqual(["next:annotation.png"]);
    releaseNext();
    expect(captureImageComposerTarget(events)).toBeNull();
  });

  it("attachment admission rejection is preserved", () => {
    const events = new EventTarget();
    const release = registerImageComposerTarget({ append: () => false }, events);
    expect(captureImageComposerTarget(events)?.append(new File(["png"], "annotation.png"))).toBe(
      false,
    );
    release();
  });
});
