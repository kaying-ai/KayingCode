import { expect, test } from "vitest";
import {
  getComposerThoughtDisplay,
  isGlmHighspeedModel,
} from "../src/chat-input-toolbar/ComposerModelMenu.js";
const options = {
  providerLabel: "Provider",
  modelsLabel: "Models",
  effortLabel: "Effort",
  selectModelLabel: "Select model",
  levels: [
    { value: "low", label: "Low" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Highest" },
  ],
  value: "",
  onValueChange: () => {},
};
test("a missing or stale thought selection stays unselected", () => {
  expect(getComposerThoughtDisplay(options)).toEqual({ label: "—", progress: 0 });
  expect(getComposerThoughtDisplay({ ...options, value: "removed" })).toEqual({
    label: "—",
    progress: 0,
  });
});
test("thought display follows the catalog order and actual selected value", () => {
  expect(getComposerThoughtDisplay({ ...options, value: "high" }).label).toBe("High");
  expect(getComposerThoughtDisplay({ ...options, value: "high" }).progress).toBeCloseTo(200 / 3);
  expect(getComposerThoughtDisplay({ ...options, value: "xhigh" })).toEqual({
    label: "Highest",
    progress: 100,
  });
});
test("ordinary provider names do not enable the upstream highspeed artwork", () => {
  expect(isGlmHighspeedModel("deepseek-v4.1-flash")).toBe(false);
  expect(isGlmHighspeedModel("glm-highspeed")).toBe(true);
});
