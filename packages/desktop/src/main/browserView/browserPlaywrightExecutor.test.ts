import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "vitest";
import { waitForDocumentState } from "./browserPlaywrightExecutor.js";
import type { ControlledView } from "./browserCommandTypes.js";

class FakeWebContents extends EventEmitter {
  loading = true;
  destroyed = false;
  crashed = false;
  isLoadingMainFrame(): boolean {
    return this.loading;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isCrashed(): boolean {
    return this.crashed;
  }
}

function controlledView(webContents: FakeWebContents): ControlledView {
  return {
    webContents: {
      loadURL: async () => undefined,
      getURL: () => "about:blank",
      getTitle: () => "",
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => undefined,
      goForward: () => undefined,
      reload: () => undefined,
      // 新实现不允许再向 guest 注入脚本；任何调用都应让用例失败。
      executeJavaScript: async () => {
        throw new Error("waitForDocumentState must not inject scripts");
      },
      isLoadingMainFrame: () => webContents.isLoadingMainFrame(),
      isDestroyed: () => webContents.isDestroyed(),
      isCrashed: () => webContents.isCrashed(),
      on: (event, listener) => {
        webContents.on(event, listener);
      },
      removeListener: (event, listener) => {
        webContents.removeListener(event, listener);
      },
    },
    cdp: { send: async () => undefined },
  };
}

test("主 frame 已停止加载时直接命中，不注入脚本", async () => {
  const webContents = new FakeWebContents();
  webContents.loading = false;
  assert.equal(await waitForDocumentState(controlledView(webContents), "load", 50), "matched");
  assert.equal(
    await waitForDocumentState(controlledView(webContents), "domcontentloaded", 50),
    "matched",
  );
});

test("dom-ready 命中 domcontentloaded 并在结算后移除监听", async () => {
  const webContents = new FakeWebContents();
  const pending = waitForDocumentState(controlledView(webContents), "domcontentloaded", 1_000);
  assert.equal(webContents.listenerCount("dom-ready"), 1);
  webContents.emit("dom-ready");
  assert.equal(await pending, "matched");
  assert.equal(webContents.listenerCount("dom-ready"), 0);
  assert.equal(webContents.listenerCount("render-process-gone"), 0);
});

test("did-stop-loading 兜底已错过的 DOMContentLoaded", async () => {
  const webContents = new FakeWebContents();
  const pending = waitForDocumentState(controlledView(webContents), "domcontentloaded", 1_000);
  webContents.emit("did-stop-loading");
  assert.equal(await pending, "matched");
});

test("did-finish-load 与 did-stop-loading 都命中 load", async () => {
  for (const event of ["did-finish-load", "did-stop-loading"] as const) {
    const webContents = new FakeWebContents();
    const pending = waitForDocumentState(controlledView(webContents), "load", 1_000);
    webContents.emit(event);
    assert.equal(await pending, "matched", event);
  }
});

test("guest renderer 崩溃时明确返回 cancelled", async () => {
  const webContents = new FakeWebContents();
  const pending = waitForDocumentState(controlledView(webContents), "load", 1_000);
  webContents.emit("render-process-gone", {}, { reason: "crashed" });
  assert.equal(await pending, "cancelled");
  assert.equal(webContents.listenerCount("did-finish-load"), 0);
});

test("guest 被销毁时返回 cancelled", async () => {
  const webContents = new FakeWebContents();
  const pending = waitForDocumentState(controlledView(webContents), "domcontentloaded", 1_000);
  webContents.emit("destroyed");
  assert.equal(await pending, "cancelled");
});

test("abort 返回 cancelled 并撤销等待", async () => {
  const webContents = new FakeWebContents();
  const controller = new AbortController();
  const pending = waitForDocumentState(
    controlledView(webContents),
    "load",
    1_000,
    controller.signal,
  );
  controller.abort();
  assert.equal(await pending, "cancelled");
});

test("等待开始前 renderer 已崩溃时返回 cancelled，不误判为加载完成", async () => {
  const webContents = new FakeWebContents();
  webContents.loading = false;
  webContents.crashed = true;
  assert.equal(await waitForDocumentState(controlledView(webContents), "load", 50), "cancelled");
});

test("超时返回 timeout", async () => {
  const webContents = new FakeWebContents();
  assert.equal(await waitForDocumentState(controlledView(webContents), "load", 10), "timeout");
});

test("networkidle 仍明确不支持", async () => {
  const webContents = new FakeWebContents();
  await assert.rejects(
    waitForDocumentState(controlledView(webContents), "networkidle", 50),
    /does not support networkidle/,
  );
});
