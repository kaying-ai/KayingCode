import { test } from "node:test";
import assert from "node:assert/strict";
import { buildElicitationContent } from "./elicitation";

test("submits all Flutter question answers in one interaction response", () => {
  assert.deepEqual(
    buildElicitationContent(
      [
        { question: "Mode?", multiSelect: false },
        { question: "Flags?", multiSelect: true },
      ],
      { "Mode?": ["safe"], "Flags?": ["a", "b"] },
    ),
    {
      answers: { "Mode?": "safe", "Flags?": "a, b" },
      answer_0: "safe",
      answer_1: ["a", "b"],
    },
  );
});
