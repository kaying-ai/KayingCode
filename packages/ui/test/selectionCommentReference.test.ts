// @vitest-environment jsdom
// 选区注释的数据契约：评论可选、去重合并、清空评论保留原文、删除撤销与已发送记录。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  toasts: [] as Array<{ message: string; options?: Record<string, unknown> }>,
}));

vi.mock("@/components/ui/toast.js", () => ({
  toast: (message: string, options?: Record<string, unknown>) => {
    mockState.toasts.push({ message, options });
  },
}));

import {
  buildPromptWithConversationSelections,
  createConversationSelectionReference,
  dispatchConversationSelectionAdd,
  getConversationSelectionAddEventName,
  getConversationSelectionReferenceScope,
  getSentConversationSelections,
  parsePromptConversationSelections,
  recordSentConversationSelections,
  removeConversationSelectionReferenceFromScope,
  restoreConversationSelectionReferenceInScope,
  retainSelectionCommentsWithLiveSource,
  setConversationSelectionReferenceScope,
  clearConversationSelectionReferenceScope,
  updateConversationSelectionCommentInScope,
  type ConversationSelectionReference,
  type MessageSelectionReference,
} from "@/lib/conversationSelectionReference.js";
import { annotationVariant } from "@/selection-comment/AnnotationNumber.js";
import { deleteConversationAnnotationWithUndo } from "@/selection-comment/annotationActions.js";
import { resolveSelectionTextAnchor } from "@/selection-comment/textAnchor.js";

const WORKSPACE = "w";
const SESSION = "s";
const anchor = { regionIndex: 0, start: 0, end: 5, rangeText: "hello" };

function reference(
  overrides: Partial<Omit<MessageSelectionReference, "id">> = {},
): ConversationSelectionReference {
  return createConversationSelectionReference({
    sourceSessionId: SESSION,
    sourceRowId: 1,
    contentType: "assistant",
    text: "hello world",
    anchor,
    ...overrides,
  });
}

beforeEach(() => {
  clearConversationSelectionReferenceScope(SESSION, WORKSPACE);
  clearConversationSelectionReferenceScope("s2", WORKSPACE);
  mockState.toasts.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("comment optional contract", () => {
  it("新增空评论 = 只加原文，引用不带 comment", () => {
    const result = dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference(),
    });
    expect(result.ok).toBe(true);
    const [stored] = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    expect(stored).toBeDefined();
    expect("comment" in (stored as object)).toBe(false);
    expect(annotationVariant(stored?.comment)).toBe("quote");
  });

  it("带评论的新增保留 comment，编号为实心", () => {
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference({ comment: "why" }),
    });
    const [stored] = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    expect(stored?.comment).toBe("why");
    expect(annotationVariant(stored?.comment)).toBe("comment");
  });

  it("同一段再次写评论时更新原条目，不新增、不丢失已有评论", () => {
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference(),
    });
    const updated = dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference({ comment: "second" }),
    });
    expect(updated.ok && updated.duplicate).toBe(true);
    const references = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    expect(references).toHaveLength(1);
    expect(references[0]?.comment).toBe("second");
    // 不带评论的重复添加不能覆盖已有评论。
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference(),
    });
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE)[0]?.comment).toBe("second");
  });

  it("编辑清空评论 = 回到只保留原文，不删除注释", () => {
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference({ comment: "note" }),
    });
    const [first] = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    updateConversationSelectionCommentInScope(SESSION, WORKSPACE, first!.id, "   ");
    const references = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    expect(references).toHaveLength(1);
    expect(references[0]?.id).toBe(first!.id);
    expect("comment" in (references[0] as object)).toBe(false);
    expect(annotationVariant(references[0]?.comment)).toBe("quote");
  });

  it("编辑保存值会 trim", () => {
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference(),
    });
    const [first] = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    updateConversationSelectionCommentInScope(SESSION, WORKSPACE, first!.id, "  new note  ");
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE)[0]?.comment).toBe(
      "new note",
    );
  });
});

describe("delete + undo", () => {
  function seed(): ConversationSelectionReference[] {
    const items = [
      reference({ text: "a", anchor: { ...anchor, start: 0, end: 1 } }),
      reference({ text: "b", anchor: { ...anchor, start: 2, end: 3 } }),
      reference({ text: "c", anchor: { ...anchor, start: 4, end: 5 } }),
    ];
    setConversationSelectionReferenceScope(SESSION, WORKSPACE, items);
    return items;
  }

  it("删除后其余编号自动补位，撤销按原位置恢复", () => {
    const items = seed();
    const removed = removeConversationSelectionReferenceFromScope(
      SESSION,
      WORKSPACE,
      items[1]!.id,
    );
    expect(removed?.index).toBe(1);
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE).map((item) => item.text)).toEqual(
      ["a", "c"],
    );
    const restored = restoreConversationSelectionReferenceInScope(
      SESSION,
      WORKSPACE,
      removed!,
    );
    expect(restored).toBe(true);
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE).map((item) => item.text)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("列表垃圾桶删除给出 6 秒撤销入口，撤销后恢复", () => {
    const items = seed();
    deleteConversationAnnotationWithUndo({
      sessionId: SESSION,
      workspaceKey: WORKSPACE,
      id: items[2]!.id,
      formatMessage: (id) => id,
    });
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE)).toHaveLength(2);
    expect(mockState.toasts).toHaveLength(1);
    expect(mockState.toasts[0]?.message).toBe("selectionComment.deleted");
    expect(mockState.toasts[0]?.options).toMatchObject({
      variant: "info",
      actionLabel: "selectionComment.undo",
      durationMs: 6000,
    });
    const onAction = mockState.toasts[0]?.options?.onAction as (() => void) | undefined;
    onAction?.();
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE)).toHaveLength(3);
  });

  it("撤销时若已达条数上限，放弃撤销而不是挤掉别的注释", () => {
    const items = seed();
    const removed = removeConversationSelectionReferenceFromScope(
      SESSION,
      WORKSPACE,
      items[0]!.id,
    )!;
    const filler = Array.from({ length: 8 }, (_, index) =>
      reference({ text: `filler-${index}`, anchor: { ...anchor, start: 100 + index, end: 101 + index } }),
    );
    setConversationSelectionReferenceScope(SESSION, WORKSPACE, filler);
    expect(restoreConversationSelectionReferenceInScope(SESSION, WORKSPACE, removed)).toBe(false);
    expect(getConversationSelectionReferenceScope(SESSION, WORKSPACE)).toHaveLength(8);
  });
});

describe("scope change refresh event", () => {
  it("编辑/删除/撤销后派发带 scopeChanged 的事件，让 composer 重读存储", async () => {
    const events: Array<{ targetSessionId?: string | null; workspaceKey?: string; scopeChanged?: boolean }> =
      [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent).detail);
    };
    window.addEventListener(getConversationSelectionAddEventName(), listener);
    dispatchConversationSelectionAdd({
      targetSessionId: SESSION,
      workspaceKey: WORKSPACE,
      reference: reference({ comment: "note" }),
    });
    const [first] = getConversationSelectionReferenceScope(SESSION, WORKSPACE);
    updateConversationSelectionCommentInScope(SESSION, WORKSPACE, first!.id, "");
    const removed = removeConversationSelectionReferenceFromScope(SESSION, WORKSPACE, first!.id)!;
    restoreConversationSelectionReferenceInScope(SESSION, WORKSPACE, removed);
    await Promise.resolve();
    await Promise.resolve();
    window.removeEventListener(getConversationSelectionAddEventName(), listener);
    const scopeEvents = events.filter(
      (detail) =>
        detail.scopeChanged === true &&
        detail.targetSessionId === SESSION &&
        detail.workspaceKey === WORKSPACE,
    );
    expect(scopeEvents).toHaveLength(3);
  });
});

describe("sent annotation records", () => {
  it("只记录带锚点的非 markdown 引用，并替换同 id 的旧记录", () => {
    const anchored = { ...reference({ comment: "sent" }), id: "r1" };
    const unanchored = createConversationSelectionReference({
      sourceSessionId: SESSION,
      sourceRowId: 2,
      contentType: "assistant",
      text: "no anchor",
    });
    const markdown = createConversationSelectionReference({
      contentType: "markdown",
      sourceKey: "a.md",
      sourceTitle: "a.md",
      text: "doc",
    });
    recordSentConversationSelections(SESSION, WORKSPACE, [anchored, unanchored, markdown]);
    expect(getSentConversationSelections(SESSION, WORKSPACE).map((item) => item.id)).toEqual([
      "r1",
    ]);
    recordSentConversationSelections(SESSION, WORKSPACE, [anchored]);
    expect(getSentConversationSelections(SESSION, WORKSPACE)).toHaveLength(1);
  });
});

describe("rewind pruning", () => {
  it("来源行被删除时只剪掉带评论的注释，仅原文注释保留", () => {
    const commented = reference({
      sourceRowId: 2,
      text: "a",
      comment: "gone",
      anchor: { ...anchor, start: 0, end: 1 },
    });
    const quoteOnly = reference({
      sourceRowId: 2,
      text: "b",
      anchor: { ...anchor, start: 2, end: 3 },
    });
    // 窗口覆盖第 2 行但行已不存在 = rewind 删除了来源行。
    expect(
      retainSelectionCommentsWithLiveSource([commented, quoteOnly], SESSION, {
        window: [{ rowId: 1 }, { rowId: 3 }],
        firstRowId: 1,
      }),
    ).toEqual([quoteOnly]);
    // 窗口尚未覆盖的历史行不能当作已删除。
    expect(
      retainSelectionCommentsWithLiveSource([commented], SESSION, {
        window: [{ rowId: 5 }],
        firstRowId: 1,
      }),
    ).toEqual([commented]);
    // 整个活动分支回滚（窗口为空且 firstRowId 归零）时删除。
    expect(
      retainSelectionCommentsWithLiveSource([commented], SESSION, {
        window: [],
        firstRowId: null,
      }),
    ).toEqual([]);
  });
});

describe("prompt contract keeps comment and agent", () => {
  it("发送块携带 comment/agent，历史解析能原样恢复", () => {
    const text = buildPromptWithConversationSelections("question", [
      {
        text: "quoted",
        comment: "annotation",
        agent: "Explore",
      },
    ]);
    expect(text).toContain('"comment":"annotation"');
    expect(text).toContain('"agent":"Explore"');
    const parsed = parsePromptConversationSelections(text);
    expect(parsed.visibleContent).toBe("question");
    expect(parsed.references).toEqual([
      { text: "quoted", comment: "annotation", agent: "Explore" },
    ]);
  });
});

describe("text anchor restoration", () => {
  it("文字一致时还原 Range，不一致或区域缺失时返回 null", () => {
    const row = document.createElement("div");
    row.innerHTML = '<p data-conversation-selectable="true">hello world</p>';
    expect(resolveSelectionTextAnchor(row, anchor, "hello world")).not.toBeNull();
    expect(resolveSelectionTextAnchor(row, { ...anchor, rangeText: "changed" }, "hello world")).toBeNull();
    expect(
      resolveSelectionTextAnchor(row, { ...anchor, regionIndex: 3, rangeText: "hello" }, "hello world"),
    ).toBeNull();
  });
});
