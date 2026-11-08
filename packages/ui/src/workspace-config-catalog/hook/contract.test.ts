// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { IServiceAccessor } from "../contract.js";
import { registerSourceSettingsServices } from "@/store/sourceSettingsServiceStore.js";
import { useConfigWorkspaceServicesResolution, useSettingsSourceServices } from "../index.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  mobile: false,
  baseRpcReady: false,
  request: vi.fn(async () => ({ attachmentId: "config" })),
}));
vi.mock("@/hooks/useWorkspaceServices.js", () => ({
  useWorkspaceServicesResolution: () => ({
    services: {},
    remoteSessionId: null,
    isRemoteTarget: state.baseRpcReady,
    connectionKind: state.baseRpcReady ? "local-ready" : "remote-waiting",
    rpcReady: state.baseRpcReady,
  }),
}));
const platform = { requestSourceSettingsAttachment: state.request };
vi.mock("@/hooks/usePlatform.js", () => ({
  useOptionalPlatform: () => (state.mobile ? null : platform),
}));

let root: Root | null = null;

function renderHook<P extends object, T>(useHook: (props: P) => T, initialProps: P) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const result = { current: null as T | null };
  function Probe(props: P) {
    result.current = useHook(props);
    return null;
  }
  const render = (props: P) => {
    act(() => root?.render(createElement(Probe, props)));
  };
  render(initialProps);
  return { result: result as { current: T }, render };
}

async function waitFor(check: () => void, timeoutMs = 2000) {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      check();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  state.mobile = false;
  state.baseRpcReady = false;
  state.request.mockClear();
});

it("无 tab 配置必须先完成远端 canonical 绑定，未完成与旧结果都不开放写入", async () => {
  let finish!: () => void;
  const resolveWorkspace = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const services = {
    sourceServerWorkspaceService: { resolveWorkspace },
  } as unknown as IServiceAccessor;
  const release = registerSourceSettingsServices({
    sourceServerId: "config-owner",
    attachmentId: "config",
    services,
    dispose: vi.fn(),
  });
  try {
    const { result, render } = renderHook(
      ({ path }: { path: string }) =>
        useConfigWorkspaceServicesResolution(path, undefined, `remote:server:config-owner:${path}`),
      { path: "/root-a" },
    );
    expect(result.current.rpcReady).toBe(false);
    await waitFor(() =>
      expect(resolveWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ workspacePath: "/root-a" }),
      ),
    );
    const first = finish;
    render({ path: "/root-b" });
    await waitFor(() => expect(resolveWorkspace).toHaveBeenCalledTimes(2));
    await act(async () => first());
    expect(result.current.rpcReady).toBe(false);
    await act(async () => finish());
    expect(result.current.rpcReady).toBe(true);
    expect(result.current.services).toBe(services);
    act(release);
    expect(result.current.rpcReady).toBe(false);
  } finally {
    act(release);
  }
});

it("手机不能借配置目录读取取得桌面 Source settings attachment", () => {
  state.mobile = true;
  const release = registerSourceSettingsServices({
    sourceServerId: "mobile-owner",
    attachmentId: "desktop-only",
    services: {} as IServiceAccessor,
    dispose: vi.fn(),
  });
  try {
    const { result } = renderHook(
      () =>
        useConfigWorkspaceServicesResolution(
          "/repo",
          undefined,
          "remote:server:mobile-owner:/repo",
        ),
      {},
    );
    expect(result.current.rpcReady).toBe(false);
    expect(state.request).not.toHaveBeenCalled();
  } finally {
    act(release);
  }
});

it("Source 设置页拿到 id 即请求配置 attachment", async () => {
  const { result } = renderHook(() => useSettingsSourceServices("source-owner"), {});
  await waitFor(() => expect(state.request).toHaveBeenCalledWith("source-owner"));
  expect(result.current).toBeUndefined();
});

it("unscoped Source services 就绪前保持等待，不回退本机服务", () => {
  state.baseRpcReady = true;
  const { result } = renderHook(
    () =>
      useConfigWorkspaceServicesResolution(
        undefined,
        undefined,
        undefined,
        undefined,
        { forceUnscoped: true },
        { requireUnscopedServices: true },
      ),
    {},
  );
  expect(result.current.connectionKind).toBe("remote-waiting");
  expect(result.current.rpcReady).toBe(false);
});

it("未启用配置目录时不请求 Source attachment", () => {
  renderHook(
    () =>
      useConfigWorkspaceServicesResolution(
        "/repo",
        undefined,
        "remote:server:config-owner:/repo",
        undefined,
        undefined,
        { enabled: false },
      ),
    {},
  );
  expect(state.request).not.toHaveBeenCalled();
});
