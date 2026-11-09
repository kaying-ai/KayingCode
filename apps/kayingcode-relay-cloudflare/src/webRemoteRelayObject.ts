import { DurableObject } from "cloudflare:workers";
import { WEB_REMOTE_CONTROL_RPC_TRANSPORT_LIMITS } from "@zcode/shared";
import {
  WEB_REMOTE_CONTROL_RELAY_V2_HTTP,
  parseWebRemoteControlRelayV2HttpRequest,
  parseWebRemoteControlRelayV2OutgoingMessage,
  type WebRemoteControlRelayV2Device,
  type WebRemoteControlRelayV2Role,
} from "@zcode/shared/web-remote-relay";
import type { RelayCloudflareEnv } from "./contract.js";
import {
  RemoteAccounts,
  randomRemoteSecret,
  remoteSecretDigest,
  resolveRemoteInvitePolicy,
  type RemoteAuthority,
} from "./remoteAccounts.js";
interface Device extends WebRemoteControlRelayV2Device {
  userId: string;
}
interface Ticket {
  authority: RemoteAuthority;
  role: WebRemoteControlRelayV2Role;
  credentialDigest: string;
  expiresAt: number;
}
interface Peer extends Ticket {
  lease: string;
  sid?: string;
  terminalSid?: string;
  initialized: boolean;
  mid?: string;
}
const seconds = () => Math.floor(Date.now() / 1000);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const success = (data: unknown) => json({ code: 0, msg: "ok", data });
const failure = (status: number, msg: string) => json({ code: status, msg, data: null }, status);

/** V2 服务只拥有授权、presence 和 socket lease；data 内容不进入业务状态或持久化。 */
export class WebRemoteRelayObject extends DurableObject<RelayCloudflareEnv> {
  private readonly accounts: RemoteAccounts;
  constructor(ctx: DurableObjectState, env: RelayCloudflareEnv) {
    super(ctx, env);
    this.accounts = new RemoteAccounts(ctx.storage, Date.now, resolveRemoteInvitePolicy(env));
  }
  fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(() => this.handle(request));
  }
  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/readyz" && request.method === "GET") {
      try { await this.ctx.storage.get("__readiness_probe"); return json({ ready: true }); }
      catch { return json({ ready: false }, 503); }
    }
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      return failure(413, "body_too_large");
    let body: unknown = {};
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 4096) return failure(413, "body_too_large");
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return failure(400, "invalid_json");
      }
    }
    const object =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const bearer =
      request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1] ?? "";
    if (url.pathname === "/api/v1/account/register" && request.method === "POST") {
      try {
        return json(
          await this.accounts.register(
            typeof object.ownerSecret === "string" ? object.ownerSecret : "",
          ),
        );
      } catch {
        return failure(400, "invalid_registration");
      }
    }
    if (url.pathname === "/api/v1/account/claim" && request.method === "POST") {
      try {
        return json(
          await this.accounts.claim(typeof object.invitation === "string" ? object.invitation : ""),
        );
      } catch {
        return failure(401, "invitation_expired_or_used");
      }
    }
    if (url.pathname === "/api/v1/remote/ws2") return this.upgrade(request, url);
    const authority = await this.accounts.authenticate(bearer);
    if (!authority) return failure(401, "authentication_required");
    if (url.pathname === "/api/v1/account/invite" && request.method === "POST") {
      if (authority.role !== "owner") return failure(403, "owner_required");
      return json(await this.accounts.invite(authority));
    }
    if (url.pathname === "/api/v1/account/logout" && request.method === "POST") {
      if (authority.role !== "terminal") return failure(403, "terminal_required");
      await this.accounts.logout(bearer);
      const digest = await remoteSecretDigest(bearer);
      for (const socket of this.ctx.getWebSockets())
        if (this.peer(socket)?.credentialDigest === digest)
          socket.close(1008, "credential_revoked");
      return success(null);
    }
    const operation = Object.entries(WEB_REMOTE_CONTROL_RELAY_V2_HTTP).find(
      ([, value]) => value.path === url.pathname && value.method === request.method,
    )?.[0] as keyof typeof WEB_REMOTE_CONTROL_RELAY_V2_HTTP | undefined;
    if (!operation) return failure(404, "not_found");
    const input = parseWebRemoteControlRelayV2HttpRequest(operation, body);
    if (!input) return failure(400, "wrong_param");
    if (operation === "register" && "device_mid" in input) {
      if (authority.role !== "owner") return failure(403, "owner_required");
      const device: Device = {
        device_sid: crypto.randomUUID(),
        device_mid: input.device_mid,
        online: false,
        created_at: seconds(),
        meta: {},
        userId: authority.userId,
      };
      await this.ctx.storage.put(`device:${device.device_sid}`, device);
      return success(this.publicDevice(device));
    }
    if (operation === "list") {
      const devices = await this.ctx.storage.list<Device>({ prefix: "device:" });
      return success(
        [...devices.values()]
          .filter((device) => device.userId === authority.userId)
          .map((device) => this.publicDevice(device)),
      );
    }
    if (operation === "delete" && "device_sid" in input) {
      if (authority.role !== "owner") return failure(403, "owner_required");
      const device = await this.ctx.storage.get<Device>(`device:${input.device_sid}`);
      if (!device || device.userId !== authority.userId) return failure(403, "device_not_owned");
      await this.ctx.storage.delete(`device:${input.device_sid}`);
      for (const socket of this.ctx.getWebSockets())
        if (this.peer(socket)?.sid === input.device_sid) socket.close(1008, "device_deleted");
      return success(null);
    }
    if (operation === "token" && "role" in input) {
      if ((input.role === "device") !== (authority.role === "owner"))
        return failure(403, "wrong_role");
      const token = randomRemoteSecret(16);
      const ticket: Ticket = {
        authority,
        role: input.role,
        credentialDigest: await remoteSecretDigest(bearer),
        expiresAt: Date.now() + 60000,
      };
      await this.ctx.storage.put(`token:${await remoteSecretDigest(token)}`, ticket);
      await this.ensureAlarm();
      return success({ token, expires_in: 60 });
    }
    return failure(400, "wrong_param");
  }
  private publicDevice(device: Device): WebRemoteControlRelayV2Device {
    const { userId: _userId, ...record } = device;
    return { ...record, online: !!this.findPeer(device.device_sid, "device") };
  }
  private peer(socket: WebSocket): Peer | null {
    return socket.deserializeAttachment() as Peer | null;
  }
  private findPeer(
    sid: string,
    role: WebRemoteControlRelayV2Role,
    except?: WebSocket,
  ): WebSocket | undefined {
    return this.ctx
      .getWebSockets()
      .find(
        (socket) =>
          socket !== except &&
          socket.readyState === WebSocket.OPEN &&
          this.peer(socket)?.sid === sid &&
          this.peer(socket)?.role === role &&
          this.peer(socket)?.initialized,
      );
  }
  private async upgrade(request: Request, url: URL): Promise<Response> {
    if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return failure(426, "websocket_required");
    // token 在 upgrade 前单次消费；失败后也不能重用，客户端必须重新申请。
    const key = `token:${await remoteSecretDigest(url.searchParams.get("token") ?? "")}`;
    const ticket = await this.ctx.storage.get<Ticket>(key);
    await this.ctx.storage.delete(key);
    if (
      !ticket ||
      ticket.expiresAt <= Date.now() ||
      ticket.authority.expiresAt <= Date.now() ||
      !(await this.ctx.storage.get(`credential:${ticket.credentialDigest}`))
    )
      return failure(401, "invalid_token");
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      ...ticket,
      initialized: false,
      lease: crypto.randomUUID(),
      mid: url.searchParams.get("mid") ?? undefined,
    } satisfies Peer);
    this.ctx.acceptWebSocket(pair[1]);
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const peer = this.peer(socket);
      if (
        !peer ||
        peer.authority.expiresAt <= Date.now() ||
        !(await this.ctx.storage.get(`credential:${peer.credentialDigest}`))
      ) {
        socket.close(1008, "authentication_required");
        return;
      }
      const size =
        typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
      if (
        typeof raw !== "string" ||
        size > WEB_REMOTE_CONTROL_RPC_TRANSPORT_LIMITS.maxPhysicalFrameBytes
      ) {
        socket.close(1009, "invalid_frame");
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        this.error(socket, "WRONG_PARAM");
        return;
      }
      const message = parseWebRemoteControlRelayV2OutgoingMessage(value);
      if (!message) {
        this.error(socket, "WRONG_PARAM");
        return;
      }
      if (!peer.initialized) {
        if (message.type !== "auth_init") {
          this.error(socket, "AUTH_FAILED");
          socket.close(1008, "auth_init_required");
          return;
        }
        const device = await this.ctx.storage.get<Device>(`device:${message.device_sid}`);
        if (
          !device ||
          device.userId !== peer.authority.userId ||
          (peer.role === "device" && peer.mid !== device.device_mid)
        ) {
          this.error(socket, "AUTH_FAILED");
          socket.close(1008, "device_not_owned");
          return;
        }
        const old = this.findPeer(message.device_sid, peer.role, socket);
        if (old) {
          // 先清除旧 attachment 的配对资格，迟到 close 不能影响新 lease。
          const previous = this.peer(old)!;
          old.serializeAttachment({ ...previous, initialized: false });
          this.error(old, "KICKED");
          old.close(1008, "replaced");
        }
        peer.sid = message.device_sid;
        peer.initialized = true;
        if (peer.role === "terminal") peer.terminalSid = crypto.randomUUID();
        socket.serializeAttachment(peer);
        if (peer.role === "device" && message.meta)
          await this.ctx.storage.put(`device:${device.device_sid}`, {
            ...device,
            meta: message.meta,
          });
        this.send(socket, { type: "auth_ack", device_sid: peer.sid, ...this.pairStatus(peer) });
        this.notifyPair(peer.sid, socket);
        return;
      }
      if (message.type === "auth_init") {
        this.error(socket, "WRONG_PARAM");
        return;
      }
      if (message.type === "pair_status_query") {
        this.send(socket, { type: "pair_status_ack", ...this.pairStatus(peer) });
        return;
      }
      const target = this.findPeer(peer.sid!, peer.role === "device" ? "terminal" : "device");
      if (!target) {
        this.error(socket, "DEVICE_OFFLINE");
        return;
      }
      this.send(target, { type: "data", payload: message.payload });
    });
  }
  private pairStatus(peer: Peer) {
    const target = this.findPeer(peer.sid!, peer.role === "device" ? "terminal" : "device");
    const terminal = peer.role === "terminal" ? peer : target ? this.peer(target) : null;
    return {
      pair_status: target ? "matched" : "waiting",
      ...(terminal?.terminalSid ? { terminal_sid: terminal.terminalSid } : {}),
    };
  }
  private notifyPair(sid: string, except?: WebSocket) {
    for (const socket of this.ctx.getWebSockets()) {
      const peer = this.peer(socket);
      if (
        socket !== except &&
        peer?.initialized &&
        peer.sid === sid &&
        socket.readyState === WebSocket.OPEN
      )
        this.send(socket, { type: "pair_status_ack", ...this.pairStatus(peer) });
    }
  }
  private send(socket: WebSocket, value: object) {
    try {
      socket.send(JSON.stringify({ ...value, server_ts: seconds() }));
    } catch {
      socket.close(1011, "send_failed");
    }
  }
  private error(
    socket: WebSocket,
    code: "AUTH_FAILED" | "WRONG_PARAM" | "KICKED" | "DEVICE_OFFLINE",
  ) {
    this.send(socket, { type: "error", code });
  }
  webSocketClose(socket: WebSocket): void {
    const peer = this.peer(socket);
    socket.serializeAttachment(peer ? { ...peer, initialized: false } : null);
    try {
      socket.close(1000, "closed");
    } catch {
      /* 对端已关闭。 */
    }
    if (peer?.initialized && peer.sid) this.notifyPair(peer.sid, socket);
  }
  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }
  private async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
  async alarm(): Promise<void> {
    const entries = await this.ctx.storage.list<{ expiresAt?: number }>({ prefix: "" });
    for (const [key, value] of entries)
      if (value.expiresAt && value.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
    for (const socket of this.ctx.getWebSockets()) {
      const peer = this.peer(socket);
      if (
        peer &&
        (peer.authority.expiresAt <= Date.now() ||
          (!peer.initialized && peer.expiresAt <= Date.now()))
      )
        socket.close(1008, "expired");
    }
    if (this.ctx.getWebSockets().length || entries.size)
      await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
}
