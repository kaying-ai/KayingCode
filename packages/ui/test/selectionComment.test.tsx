// @vitest-environment jsdom
// 选区注释模块：能力门禁、输入浮层不变量（空评论/IME/失败保留）与正文标记还原/编号。
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  agentService: {} as {
    supportsConversationQuoteComment?:
      | ((target: { workspacePath: string; workspaceIdentity?: string }) => Promise<boolean>)
      | undefined;
  },
}));

vi.mock("@/hooks/useServices.js", () => ({
  useServices: () => ({ kayingcodeAgentService: mockState.agentService }),
  useOptionalServices: () => null,
  ServiceProvider: ({ children }: { children: ReactNode }) => children,
  useTerminalOwnerId: () => undefined,
  useComposerClientNamespace: () => "desktop",
}));

vi.mock("@/i18n/IntlProvider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/IntlProvider.js")>();
  return {
    ...actual,
    // 断言用 key 做文案，避免测试依赖具体语言。
    useKayingCodeIntl: () => ({
      intl: { formatMessage: ({ id }: { id: string }) => id },
      locale: "en-US",
    }),
  };
});

import { SelectionActionMenu } from "@/v4/SelectionActionMenu.js";
import {
  ConversationAnnotationMarks,
  SelectionCommentEditor,
  buildAnnotationMarkItems,
  useSelectionCommentSupport,
  type AnnotationMarkItem,
} from "@/selection-comment/index.js";
import {
  createConversationSelectionReference,
  type ConversationSelectionReference,
} from "@/lib/conversationSelectionReference.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function render(node: ReactNode): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function query<T extends Element>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(textarea, value);
  act(() => {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressKey(
  textarea: HTMLTextAreaElement,
  key: string,
  options: { isComposing?: boolean; shiftKey?: boolean } = {},
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false,
  });
  // jsdom 的 KeyboardEventInit 不保证写入 isComposing；显式定义才能覆盖输入法路径。
  if (options.isComposing) Object.defineProperty(event, "isComposing", { value: true });
  act(() => {
    textarea.dispatchEvent(event);
  });
}

describe("useSelectionCommentSupport capability gating", () => {
  function SupportProbe({ enabled = true }: { enabled?: boolean }) {
    const supported = useSelectionCommentSupport("/repo", undefined, enabled);
    return createElement("span", { "data-supported": String(supported) });
  }

  it("CLI 声明 conversationQuoteComment 时才开放入口", async () => {
    mockState.agentService = { supportsConversationQuoteComment: async () => true };
    render(createElement(SupportProbe));
    await flush();
    expect(query("[data-supported]")?.getAttribute("data-supported")).toBe("true");
  });

  it("旧 Host（没有探测方法）按不支持处理", async () => {
    mockState.agentService = {};
    render(createElement(SupportProbe));
    await flush();
    expect(query("[data-supported]")?.getAttribute("data-supported")).toBe("false");
  });

  it("探测失败按不支持处理（fail closed）", async () => {
    mockState.agentService = {
      supportsConversationQuoteComment: async () => {
        throw new Error("old host");
      },
    };
    render(createElement(SupportProbe));
    await flush();
    expect(query("[data-supported]")?.getAttribute("data-supported")).toBe("false");
  });

  it("未启用（草稿/只读）时不发探测", async () => {
    const probe = vi.fn(async () => true);
    mockState.agentService = { supportsConversationQuoteComment: probe };
    render(createElement(SupportProbe, { enabled: false }));
    await flush();
    expect(probe).not.toHaveBeenCalled();
    expect(query("[data-supported]")?.getAttribute("data-supported")).toBe("false");
  });
});

describe("注释入口与添加原文入口互斥", () => {
  it("没有注释能力时仍显示“添加到当前任务”", () => {
    render(
      createElement(SelectionActionMenu, {
        center: 100,
        top: 100,
        bottom: 120,
        onAddToCurrentTask: () => {},
      }),
    );
    expect(query('[data-conversation-selection-action="add-to-task"]')).not.toBeNull();
    expect(query('[data-conversation-selection-action="comment"]')).toBeNull();
  });

  it("注释能力开启时显示“注释”入口", () => {
    render(
      createElement(SelectionActionMenu, {
        center: 100,
        top: 100,
        bottom: 120,
        onAddToCurrentTask: () => {},
        onComment: () => {},
        onAskInSideChat: () => {},
      }),
    );
    expect(query('[data-conversation-selection-action="comment"]')).not.toBeNull();
    expect(query('[data-conversation-selection-action="add-to-task"]')).toBeNull();
  });
});

describe("SelectionCommentEditor 输入不变量", () => {
  function Editor(props: {
    mode?: "add" | "edit";
    initialComment?: string;
    error?: string | null;
    onSave: (comment: string) => boolean;
    onCancel?: () => void;
  }) {
    return createElement(SelectionCommentEditor, {
      mode: props.mode ?? "add",
      number: 1,
      center: 100,
      top: 100,
      bottom: 120,
      initialComment: props.initialComment,
      error: props.error ?? null,
      onSave: props.onSave,
      onCancel: props.onCancel ?? (() => {}),
    });
  }

  it("新增留空直接保存 = 只加原文（onSave 收到空字符串）", () => {
    const onSave = vi.fn(() => true);
    render(createElement(Editor, { onSave }));
    act(() => query<HTMLButtonElement>("[data-conversation-selection-comment-save]")?.click());
    expect(onSave).toHaveBeenCalledWith("");
  });

  it("保存值已 trim", () => {
    const onSave = vi.fn(() => true);
    render(createElement(Editor, { onSave }));
    const textarea = query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!;
    setTextareaValue(textarea, "  keep quote  ");
    pressKey(textarea, "Enter");
    expect(onSave).toHaveBeenCalledWith("keep quote");
  });

  it("输入法组字中的 Enter 不保存，Shift+Enter 也不保存", () => {
    const onSave = vi.fn(() => true);
    render(createElement(Editor, { onSave }));
    const textarea = query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!;
    setTextareaValue(textarea, "批注");
    pressKey(textarea, "Enter", { isComposing: true });
    pressKey(textarea, "Enter", { shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    // 组字结束后同一次 Enter 仍能正常保存。
    pressKey(textarea, "Enter");
    expect(onSave).toHaveBeenCalledWith("批注");
  });

  it("Esc 取消不保存", () => {
    const onSave = vi.fn(() => true);
    const onCancel = vi.fn();
    render(createElement(Editor, { onSave, onCancel }));
    const textarea = query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!;
    setTextareaValue(textarea, "draft");
    pressKey(textarea, "Escape");
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("onSave 返回 false（超限）时浮层与输入保留，重试成功后才关闭", () => {
    const saveResult = { ok: false };
    function Harness() {
      const [open, setOpen] = useState(true);
      const [error, setError] = useState<string | null>(null);
      if (!open) return createElement("span", { "data-closed": "true" });
      return createElement(Editor, {
        error,
        onSave: () => {
          if (!saveResult.ok) {
            setError("chat.selections.limit.count");
            return false;
          }
          setOpen(false);
          return true;
        },
      });
    }
    render(createElement(Harness));
    const textarea = query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!;
    setTextareaValue(textarea, "too many");
    pressKey(textarea, "Enter");
    expect(query("[data-conversation-selection-comment-error]")?.textContent).toBe(
      "chat.selections.limit.count",
    );
    expect(
      query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")?.value,
    ).toBe("too many");
    // 调用方腾出空间后重试：浮层才关闭。
    saveResult.ok = true;
    pressKey(query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!, "Enter");
    expect(query("[data-conversation-selection-comment-input]")).toBeNull();
    expect(query("[data-closed]")).not.toBeNull();
  });

  it("编辑态清空评论仍保留注释（onSave 收到空字符串）", () => {
    const onSave = vi.fn(() => true);
    render(createElement(Editor, { mode: "edit", initialComment: "note", onSave }));
    const textarea = query<HTMLTextAreaElement>("[data-conversation-selection-comment-input]")!;
    expect(textarea.value).toBe("note");
    setTextareaValue(textarea, "");
    pressKey(textarea, "Enter");
    expect(onSave).toHaveBeenCalledWith("");
    // 编辑态才有删除按钮：清空评论不得走删除路径。
    expect(query("[data-conversation-selection-comment-delete]")).not.toBeNull();
  });

  it("编辑态删除按钮独立于保存触发", () => {
    const onSave = vi.fn(() => true);
    const onDelete = vi.fn();
    render(
      createElement(SelectionCommentEditor, {
        mode: "edit",
        number: 1,
        center: 100,
        top: 100,
        bottom: 120,
        initialComment: "note",
        onSave,
        onCancel: () => {},
        onDelete,
      }),
    );
    act(() => query<HTMLButtonElement>("[data-conversation-selection-comment-delete]")?.click());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("正文注释标记", () => {
  const anchor = { regionIndex: 0, start: 0, end: 5, rangeText: "hello" };

  function MarksHarness({ items }: { items: readonly AnnotationMarkItem[] }) {
    const [ref] = useState(() => ({ current: null as HTMLDivElement | null }));
    return createElement(
      "div",
      { ref },
      createElement(ConversationAnnotationMarks, {
        rootRef: ref,
        items,
        hoveredId: null,
        onHover: () => {},
        onActivate: () => {},
      }),
      createElement(
        "div",
        { "data-v4-timeline-message-layer": "true" },
        createElement(
          "div",
          { "data-row-id": "1" },
          createElement("p", { "data-conversation-selectable": "true" }, "hello world"),
        ),
      ),
    );
  }

  it("锚点文字对不上时不画任何标记", () => {
    render(
      createElement(MarksHarness, {
        items: [
          {
            id: "a",
            number: 1,
            variant: "quote",
            rowId: 1,
            anchor: { ...anchor, rangeText: "changed" },
            text: "hello",
          },
        ],
      }),
    );
    expect(query("[data-annotation-mark]")).toBeNull();
  });

  it("来源行不存在时不画任何标记", () => {
    render(
      createElement(MarksHarness, {
        items: [
          {
            id: "a",
            number: 1,
            variant: "quote",
            rowId: 99,
            anchor,
            text: "hello",
          },
        ],
      }),
    );
    expect(query("[data-annotation-mark]")).toBeNull();
  });

  it("编号 = composer 列表位置，markdown 仍占列表位置但不画标记", () => {
    const references: ConversationSelectionReference[] = [
      createConversationSelectionReference({
        sourceSessionId: "s",
        sourceRowId: 1,
        contentType: "assistant",
        text: "hello",
        anchor,
      }),
      createConversationSelectionReference({
        sourceSessionId: "s",
        sourceRowId: 1,
        contentType: "assistant",
        text: "world",
        anchor: { regionIndex: 0, start: 6, end: 11, rangeText: "world" },
      }),
      createConversationSelectionReference({
        contentType: "markdown",
        sourceKey: "file.md",
        sourceTitle: "file.md",
        text: "doc",
      }),
    ];
    const sent: ConversationSelectionReference[] = [
      createConversationSelectionReference({
        sourceSessionId: "s",
        sourceRowId: 2,
        contentType: "assistant",
        text: "old",
        anchor: { regionIndex: 0, start: 0, end: 3, rangeText: "old" },
        comment: "sent note",
      }),
    ];
    const items = buildAnnotationMarkItems({
      references,
      sent,
      sourceSessionId: "s",
      pending: references[0] ?? null,
    });
    // 当前两条 + 预占一条；markdown 不画但占列表位置（第 3 条），预占编号因此是 4。
    expect(items.filter((item) => !item.id.startsWith("sent:"))).toHaveLength(3);
    expect(items.find((item) => item.id === references[0]!.id)?.number).toBe(1);
    expect(items.find((item) => item.id === references[1]!.id)?.number).toBe(2);
    expect(items.find((item) => item.id === references[2]!.id)).toBeUndefined();
    expect(items.find((item) => item.id === "__pending__")?.number).toBe(4);
    expect(items.find((item) => item.id === "__pending__")?.variant).toBe("pending");
    expect(items.find((item) => item.id.startsWith("sent:"))?.number).toBe(1);
  });

  it("未下发注释作用域时不画正文标记", () => {
    const items = buildAnnotationMarkItems({
      references: [],
      sent: [],
      sourceSessionId: "s",
      visible: false,
    });
    expect(items).toHaveLength(0);
  });
});
