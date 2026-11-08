import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { connectViaNodeWebSocket } from "@zcode/client/node-websocket";
import { Emitter } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import {
  KAYINGCODE_RPC_HOST_CAPABILITY_HEADER,
  serverRemoteHostCapabilitySchema,
  serverRemoteInfoSchema,
  type RemoteAgentTarget,
  type ServerRemoteInfo,
} from "@zcode/shared";
import { SSHBackend } from "@zcode/server/remote/ssh-backend.js";

export interface RemoteAgentConnectionCloseEvent {
  exitCode: number | null;
  signal: string | null;
  error?: string;
}

export interface RemoteAgentConnection {
  services: IServiceAccessor;
  serverInfo: ServerRemoteInfo;
  onDidClose(listener: (event: RemoteAgentConnectionCloseEvent) => void): { dispose(): void };
  dispose(): Promise<void>;
}

function createAbortError(): Error {
  const error = new Error("远程 Agent 连接已取消");
  error.name = "AbortError";
  return error;
}

async function discoverRemoteAgentServerPort(
  backend: SSHBackend,
  signal?: AbortSignal,
): Promise<number> {
  const stream = await backend.exec('cat "$HOME/.kayingcode/server/run/status.json"');
  return new Promise<number>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      subscription.dispose();
      callback();
    };
    const handleAbort = () => finish(() => reject(createAbortError()));
    const append = (current: string, chunk: Buffer | string) => {
      const next = current + chunk.toString();
      if (next.length > 64 * 1024) throw new Error("远程 Agent Server 状态响应过大");
      return next;
    };
    stream.stdout.on("data", (chunk: Buffer | string) => {
      try {
        stdout = append(stdout, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });
    stream.stderr.on("data", (chunk: Buffer | string) => {
      try {
        stderr = append(stderr, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });
    const subscription = stream.onClose((code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(`无法读取远程 Agent Server 状态: ${stderr.trim() || `exit ${code}`}`));
          return;
        }
        try {
          const status = JSON.parse(stdout) as Record<string, unknown>;
          if (
            status.state !== "ready" ||
            typeof status.port !== "number" ||
            !Number.isInteger(status.port) ||
            status.port < 1 ||
            status.port > 65_535
          ) {
            throw new Error("远程 Agent Server 尚未 ready，或状态文件缺少有效端口");
          }
          resolve(status.port);
        } catch (error) {
          reject(error);
        }
      });
    });
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${label} 请求失败 (${response.status})`);
  }
  return response.json();
}

export async function connectRemoteAgent(params: {
  target: RemoteAgentTarget;
  signal?: AbortSignal;
  request?: typeof fetch;
}): Promise<RemoteAgentConnection> {
  const { target, signal } = params;
  if (signal?.aborted) throw createAbortError();
  let privateKey: Buffer | undefined;
  if (target.ssh.privateKeyPath) {
    const keyPath = target.ssh.privateKeyPath.replace(/^~/u, homedir());
    privateKey = await readFile(keyPath);
  }
  const backend = new SSHBackend({
    ...target.ssh,
    privateKey,
    privateKeyPassphrase: target.ssh.privateKeyPassphrase,
  });
  const closeEmitter = new Emitter<RemoteAgentConnectionCloseEvent>();
  let forward: Awaited<ReturnType<SSHBackend["openLocalForward"]>> | undefined;
  let websocket: Awaited<ReturnType<typeof connectViaNodeWebSocket>> | undefined;
  let disposed = false;
  let closeReported = false;
  const reportClose = (event: RemoteAgentConnectionCloseEvent) => {
    if (disposed || closeReported) return;
    closeReported = true;
    closeEmitter.fire(event);
  };
  const backendCloseSubscription = backend.onDidDisconnect((event) =>
    reportClose({
      exitCode: null,
      signal: null,
      ...(event.error ? { error: event.error.message } : {}),
    }),
  );
  try {
    const serverPort = target.serverPort ?? (await discoverRemoteAgentServerPort(backend, signal));
    forward = await backend.openLocalForward(serverPort, signal);
    const origin = `http://${forward.localHost}:${forward.localPort}`;
    const request = params.request ?? fetch;
    const serverInfo = serverRemoteInfoSchema.parse(
      await readJson(
        await request(`${origin}/api/server-info`, { signal }),
        "远程 Agent server-info",
      ),
    );
    if (serverInfo.authRequired || !serverInfo.auth?.methods.includes("ssh-tunnel")) {
      throw new Error("远程 Agent Server 不允许仅通过 SSH tunnel 认证");
    }
    if (serverInfo.workspaces.length === 0) {
      throw new Error("远程 Agent Server 未配置可用 workspace");
    }
    const capability = serverRemoteHostCapabilitySchema.parse(
      await readJson(
        await request(`${origin}/api/rpc-host-capability`, { method: "POST", signal }),
        "远程 Agent host capability",
      ),
    );
    if (capability.instanceGeneration !== serverInfo.instanceGeneration) {
      throw new Error("远程 Agent Server 在握手期间已重启，请重新连接");
    }
    websocket = await connectViaNodeWebSocket(
      `ws://${forward.localHost}:${forward.localPort}/ws/host`,
      {
        headers: { [KAYINGCODE_RPC_HOST_CAPABILITY_HEADER]: capability.capability },
        signal,
      },
    );
    websocket.onDidClose((event) =>
      reportClose({
        exitCode: event.code,
        signal: null,
        ...(event.reason ? { error: event.reason } : {}),
      }),
    );
    if (signal?.aborted) throw createAbortError();
    return {
      services: websocket.services,
      serverInfo,
      onDidClose: closeEmitter.event,
      async dispose() {
        if (disposed) return;
        disposed = true;
        backendCloseSubscription.dispose();
        websocket?.dispose();
        await forward?.dispose().catch(() => undefined);
        backend.dispose();
        closeEmitter.dispose();
      },
    };
  } catch (error) {
    disposed = true;
    backendCloseSubscription.dispose();
    websocket?.dispose();
    await forward?.dispose().catch(() => undefined);
    backend.dispose();
    closeEmitter.dispose();
    throw error;
  }
}
