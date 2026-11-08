import { describe, expect, it } from "vitest";
import { getKayingCodeAgentAvailableModes } from "@zcode/shared";
import {
  KAYINGCODE_MODE_OPTION_LABEL_IDS,
  KAYINGCODE_MODE_OPTION_DESCRIPTION_IDS,
} from "@/chat-input-toolbar/display-help.js";
import zh from "@/i18n/locales/zh-CN.js";
import en from "@/i18n/locales/en-US.js";

describe("mode catalog presentation", () => {
  for (const [language, messages] of [
    ["zh", zh],
    ["en", en],
  ] as const) {
    it(`covers every runtime mode with a ${language} title and description`, () => {
      for (const mode of getKayingCodeAgentAvailableModes()) {
        const label = KAYINGCODE_MODE_OPTION_LABEL_IDS.glm[mode.id];
        const description = KAYINGCODE_MODE_OPTION_DESCRIPTION_IDS.glm[mode.id];
        expect(messages[label], `${mode.id} label`).toBeTruthy();
        expect(messages[description], `${mode.id} description`).toBeTruthy();
      }
    });
  }
});
