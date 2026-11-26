// 队列编辑锁归属（docs/ui/composer-edit-mode.md）：
// 本端 = 投影 editorId 相同且本地编辑态正在编辑该项；其余一律按其他端展示，
// 保证刷新后遗留的锁仍有「解除」入口，队首不会永久冻结。
import { describe, expect, it } from "vitest";
import { resolveEditLockOwner } from "../src/v4/ConversationQueuePanel.js";

function item(queueItemId: string, editLock?: { editorId: string; clientId: string }) {
  return { queueItemId, ...(editLock ? { editLock } : {}) } as never;
}

describe("resolveEditLockOwner", () => {
  it("无锁且本端未编辑 = 普通行", () => {
    expect(resolveEditLockOwner(item("q1"), "editor-a", null, false)).toBeNull();
  });

  it("lock ACK 早于投影：本端编辑态在确认前按本端锁显示", () => {
    expect(resolveEditLockOwner(item("q1"), "editor-a", "q1", false)).toBe("self");
  });

  it("投影确认且 editorId 相同 = 本端", () => {
    expect(
      resolveEditLockOwner(
        item("q1", { editorId: "editor-a", clientId: "c" }),
        "editor-a",
        "q1",
        true,
      ),
    ).toBe("self");
  });

  it("editorId 不同 = 其他端", () => {
    expect(
      resolveEditLockOwner(
        item("q1", { editorId: "editor-b", clientId: "c" }),
        "editor-a",
        "q1",
        true,
      ),
    ).toBe("other");
  });

  it("遗留锁但没有本地编辑态 = 其他端（提供解除入口）", () => {
    expect(
      resolveEditLockOwner(
        item("q1", { editorId: "editor-a", clientId: "c" }),
        "editor-a",
        null,
        false,
      ),
    ).toBe("other");
  });

  it("本端编辑态已切到其他项时，旧锁按其他端处理", () => {
    expect(
      resolveEditLockOwner(
        item("q1", { editorId: "editor-a", clientId: "c" }),
        "editor-a",
        "q2",
        true,
      ),
    ).toBe("other");
  });
});
