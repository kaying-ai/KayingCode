import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExtensionHostEnv,
  createExtensionHostSupervisor,
} from "../src/main/extensionHostSupervisor.js";

const electronMocks = vi.hoisted(() => ({ fork: vi.fn() }));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  MessageChannelMain: class {
    port1 = { id: "port1" };
    port2 = { id: "port2" };
  },
  utilityProcess: { fork: electronMocks.fork },
}));

class FakeProcess extends EventEmitter {
  pid = 42;
  stdout = new PassThrough();
  stderr = new PassThrough();
  postMessage = vi.fn((message: unknown) => {
    if ((message as { type?: string } | null)?.type === "extension-host/dispose") {
      queueMicrotask(() => this.emit("exit", 0));
    }
  });
  kill = vi.fn(() => this.emit("exit", 1));
}

class FakeHost extends EventEmitter {
  pid = 7;
  postMessage = vi.fn();
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("extension host supervisor", () => {
  beforeEach(() => {
    electronMocks.fork.mockClear();
  });

  it("passes only allowlisted environment values and settings-page network config", () => {
    const env = buildExtensionHostEnv(
      {
        PATH: "/bin",
        HOME: "/home/user",
        SECRET_TOKEN: "do-not-pass",
        ZCODE_TELEMETRY_REPORT_ENDPOINT: "https://telemetry.invalid",
        HTTP_PROXY: "shell-proxy:8080",
        LANG: "en_US.UTF-8",
      },
      "linux",
      {
        httpProxy: "settings-proxy:3128",
        noProxy: " localhost, .corp.example , ",
        caCertPath: "/etc/ca.pem",
      },
    );

    expect(env).toMatchObject({
      PATH: "/bin",
      HOME: "/home/user",
      LANG: "en_US.UTF-8",
      HTTP_PROXY: "http://settings-proxy:3128",
      http_proxy: "http://settings-proxy:3128",
      NO_PROXY: "localhost,.corp.example",
      no_proxy: "localhost,.corp.example",
      NODE_EXTRA_CA_CERTS: "/etc/ca.pem",
      KAYINGCODE_PROCESS_LABEL: "extension-host",
    });
    expect(env.SECRET_TOKEN).toBeUndefined();
    expect(env.ZCODE_TELEMETRY_REPORT_ENDPOINT).toBeUndefined();
  });

  it("starts on the first ready window, pairs a port, and restarts after a crash", async () => {
    vi.useFakeTimers();
    try {
      const children: FakeProcess[] = [];
      electronMocks.fork.mockImplementation(() => {
        const child = new FakeProcess();
        children.push(child);
        return child;
      });
      const supervisor = createExtensionHostSupervisor({ logger });
      const host = new FakeHost();
      supervisor.trackWindowHost(host as never);

      host.emit("message", { type: "extension-host/window-ready" });
      await vi.advanceTimersByTimeAsync(0);
      expect(electronMocks.fork).toHaveBeenCalledTimes(1);
      expect(host.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "extension-host/status" }),
        undefined,
      );

      children[0]!.emit("spawn");
      children[0]!.emit("message", { type: "extension-host/ready", gen: 1 });
      expect(host.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "extension-host/pair" }),
        [expect.anything()],
      );

      children[0]!.emit("exit", 1);
      await vi.advanceTimersByTimeAsync(1_000);

      expect(electronMocks.fork).toHaveBeenCalledTimes(2);
      await supervisor.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops restarting after the crash budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      const children: FakeProcess[] = [];
      electronMocks.fork.mockImplementation(() => {
        const child = new FakeProcess();
        children.push(child);
        return child;
      });
      const supervisor = createExtensionHostSupervisor({ logger });
      const host = new FakeHost();
      supervisor.trackWindowHost(host as never);
      host.emit("message", { type: "extension-host/window-ready" });
      await vi.advanceTimersByTimeAsync(0);

      for (let index = 0; index < 4; index += 1) {
        children[index]!.emit("exit", 1);
        await vi.advanceTimersByTimeAsync(4_000);
      }

      expect(electronMocks.fork).toHaveBeenCalledTimes(4);
      expect(host.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension-host/status",
          status: expect.objectContaining({ state: "stopped" }),
        }),
        undefined,
      );
      await supervisor.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
