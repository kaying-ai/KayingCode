import assert from "node:assert/strict";
import { test } from "vitest";
import type { BrowserScreenshotObservation } from "@zcode/shared";
import {
  BrowserScreenshotInputError,
  resolveScreenshotTapPoint,
  validateBrowserScreenshotObservation,
  type StoredBrowserScreenshotObservation,
} from "./browserScreenshotObservation.js";

const observation: BrowserScreenshotObservation = {
  observationId: "observation-1",
  tabId: "taptap-preview:task-1",
  viewportCss: { width: 400, height: 800 },
  imagePixels: { width: 600, height: 1200 },
  clipCss: { x: 50, y: 80, width: 200, height: 400 },
  sampledAt: 1,
};

const stored: StoredBrowserScreenshotObservation = {
  observation,
  guestGeneration: 3,
  url: "https://maker.taptap.cn/project/demo?tab=preview",
  actionSequence: 7,
};

test("screenshot tap maps image and normalized coordinates without using DPR", () => {
  assert.deepEqual(
    resolveScreenshotTapPoint(observation, {
      coordinateSpace: "image",
      point: { x: 300, y: 600 },
    }),
    { cx: 150, cy: 280 },
  );
  assert.deepEqual(
    resolveScreenshotTapPoint(observation, {
      coordinateSpace: "normalized",
      point: { x: 0.5, y: 0.5 },
    }),
    { cx: 200, cy: 400 },
  );
});

test("screenshot tap rejects out-of-bounds input instead of clamping", () => {
  assert.throws(
    () =>
      resolveScreenshotTapPoint(observation, {
        coordinateSpace: "image",
        point: { x: 600, y: 200 },
      }),
    (error: unknown) =>
      error instanceof BrowserScreenshotInputError && error.code === "input_out_of_bounds",
  );
  assert.throws(
    () =>
      resolveScreenshotTapPoint(observation, {
        coordinateSpace: "normalized",
        point: { x: -0.01, y: 0.5 },
      }),
    (error: unknown) =>
      error instanceof BrowserScreenshotInputError && error.code === "input_out_of_bounds",
  );
});

test("screenshot observation becomes stale when identity, viewport, URL, or action changes", () => {
  const current = {
    observationId: observation.observationId,
    tabId: observation.tabId,
    guestGeneration: 3,
    url: stored.url,
    actionSequence: 7,
    viewportCss: { width: 400, height: 800 },
  };
  assert.doesNotThrow(() => validateBrowserScreenshotObservation(stored, current));

  for (const patch of [
    { observationId: "new-observation" },
    { tabId: "other-tab" },
    { guestGeneration: 4 },
    { url: "https://maker.taptap.cn/project/demo?tab=chat" },
    { actionSequence: 8 },
    { viewportCss: { width: 401, height: 800 } },
  ]) {
    assert.throws(
      () => validateBrowserScreenshotObservation(stored, { ...current, ...patch }),
      (error: unknown) =>
        error instanceof BrowserScreenshotInputError && error.code === "observation_stale",
    );
  }
});
