// 合规标识的跨端锁定（对齐 theme.test.ts 的对等断言口径）：文案、两端挂载点与
// 手势穿透不得单侧漂移，否则审核口径会在某一个客户端失效。
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AI_CONTENT_LABEL_TEXT } from "./aiContentLabel";

const FLUTTER_LABEL_FILE =
  "../../../../kayingcode-mobile-flutter/lib/ui/ai_content_label.dart";
const FLUTTER_CHAT_PAGE =
  "../../../../kayingcode-mobile-flutter/lib/ui/chat_page.dart";

describe("AI 生成内容标识", () => {
  test("文案与 Flutter 端逐字一致且两端聊天页都挂载", async () => {
    assert.equal(AI_CONTENT_LABEL_TEXT, "内容由AI生成");

    const flutterLabel = await readFile(
      new URL(FLUTTER_LABEL_FILE, import.meta.url),
      "utf8",
    );
    assert.match(flutterLabel, /aiContentLabelText = '内容由AI生成';/);

    const flutterChat = await readFile(
      new URL(FLUTTER_CHAT_PAGE, import.meta.url),
      "utf8",
    );
    assert.match(flutterChat, /AiContentLabel\(/);
  });

  test("Taro 聊天页渲染常驻标识", async () => {
    const page = await readFile(
      new URL("../../pages/chat/index.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /\{AI_CONTENT_LABEL_TEXT\}/);
    assert.match(page, /className="ai-label"/);
  });

  test("标识不拦截手势且只用中性色", async () => {
    const css = await readFile(new URL("./chat.css", import.meta.url), "utf8");
    const wrapper = /\.chat \.ai-label \{([^}]*)\}/.exec(css)?.[1] ?? "";
    assert.match(wrapper, /pointer-events: none;/);
    assert.match(wrapper, /position: absolute;/);

    const pill = /\.ai-label-text \{([^}]*)\}/.exec(css)?.[1] ?? "";
    assert.match(pill, /background: var\(--card\);/);
    assert.match(pill, /color: var\(--soft\);/);
    assert.doesNotMatch(pill, /var\(--(ok|error|run|warn)\)/);
  });
});
