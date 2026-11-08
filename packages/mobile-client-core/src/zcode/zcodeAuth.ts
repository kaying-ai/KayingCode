import type { RelayPlatformFetch } from "../relayPlatform.js";

export type ZcodeLoginProvider = "zai" | "bigmodel";
export interface ZcodeLoginFlow {
  authorizeUrl: string;
  expiresAt: number;
  pollIntervalMs: number;
}

export class ZcodeAuthError extends Error {
  constructor(
    readonly reason: "auth-required" | "login-expired" | "login-failed" | "relay-unavailable",
  ) {
    super(reason);
    this.name = "ZcodeAuthError";
  }
}

interface AuthPorts {
  origin: string;
  request: RelayPlatformFetch;
  randomSecret: () => Promise<string>;
  now?: () => number;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 每个 origin 一个所有者；JWT 与 poll secret 不进入设备 URL、导出或日志。 */
export class ZcodeAuthSession {
  private jwt: string | null = null;
  private generation = 0;
  private pending: (ZcodeLoginFlow & { id: string; secret: string; nextPollAt: number }) | null =
    null;
  private pollFlight: Promise<boolean> | null = null;
  private readonly now: () => number;

  constructor(private readonly ports: AuthPorts) {
    if (!/^https:\/\/[^/?#@]+$/.test(ports.origin))
      throw new Error("ZCode auth requires HTTPS origin");
    this.now = ports.now ?? Date.now;
  }

  get signedIn(): boolean {
    return this.jwt !== null;
  }

  cancelLogin(): void {
    this.generation += 1;
    this.pending = null;
    this.pollFlight = null;
  }

  logout(): void {
    this.cancelLogin();
    this.jwt = null;
  }

  private async request(
    path: string,
    token: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    let response;
    try {
      response = await this.ports.request(`${this.ports.origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ZcodeAuthError("relay-unavailable");
    }
    if (response.status === 401) throw new ZcodeAuthError("auth-required");
    if (!response.ok) throw new ZcodeAuthError("relay-unavailable");
    let value: Record<string, unknown>;
    try {
      value = record(await response.json());
    } catch {
      throw new ZcodeAuthError("relay-unavailable");
    }
    if (value.code !== 0) throw new ZcodeAuthError("relay-unavailable");
    return record(value.data);
  }

  async begin(provider: ZcodeLoginProvider): Promise<ZcodeLoginFlow> {
    this.logout();
    const generation = this.generation;
    const secret = await this.ports.randomSecret();
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Secure OAuth random source unavailable");
    if (generation !== this.generation) throw new ZcodeAuthError("login-expired");
    const data = await this.request("/api/v1/oauth/cli/init", secret, { provider });
    if (generation !== this.generation) throw new ZcodeAuthError("login-expired");
    const id = text(data.flow_id),
      authorizeUrl = text(data.authorize_url);
    const expiresAt = Number(data.expires_at) * 1000;
    const pollIntervalMs = Number(data.poll_interval_sec) * 1000;
    if (
      !id ||
      !/^https:\/\/[^\s]+$/.test(authorizeUrl) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.now() ||
      !Number.isFinite(pollIntervalMs) ||
      pollIntervalMs < 1000 ||
      pollIntervalMs >= expiresAt - this.now()
    )
      throw new ZcodeAuthError("login-failed");
    this.pending = { id, secret, authorizeUrl, expiresAt, pollIntervalMs, nextPollAt: 0 };
    return { authorizeUrl, expiresAt, pollIntervalMs };
  }

  poll(): Promise<boolean> {
    if (this.pollFlight) return this.pollFlight;
    const flight = this.pollOnce();
    this.pollFlight = flight;
    void flight.then(
      () => {
        if (this.pollFlight === flight) this.pollFlight = null;
      },
      () => {
        if (this.pollFlight === flight) this.pollFlight = null;
      },
    );
    return flight;
  }

  private async pollOnce(): Promise<boolean> {
    const pending = this.pending;
    if (!pending) return this.signedIn;
    if (this.now() >= pending.expiresAt) {
      this.cancelLogin();
      throw new ZcodeAuthError("login-expired");
    }
    if (this.now() < pending.nextPollAt) return false;
    pending.nextPollAt = this.now() + pending.pollIntervalMs;
    let data: Record<string, unknown>;
    try {
      data = await this.request(
        `/api/v1/oauth/cli/poll/${encodeURIComponent(pending.id)}`,
        pending.secret,
      );
    } catch (error) {
      if (this.pending !== pending) return false;
      throw error;
    }
    // 关闭/替换登录后，迟到的 ready 不能恢复已取消账户。
    if (this.pending !== pending) return false;
    if (this.now() >= pending.expiresAt) {
      this.cancelLogin();
      throw new ZcodeAuthError("login-expired");
    }
    if (data.status === "pending") return false;
    if (data.status !== "ready" || !text(data.token) || !text(record(data.user).user_id)) {
      this.cancelLogin();
      throw new ZcodeAuthError("login-failed");
    }
    this.jwt = text(data.token);
    this.pending = null;
    return true;
  }

  async getTerminalToken(): Promise<string> {
    if (!this.jwt) throw new ZcodeAuthError("auth-required");
    const generation = this.generation;
    try {
      const data = await this.request("/api/v1/remote/token", this.jwt, { role: "terminal" });
      if (generation !== this.generation) throw new ZcodeAuthError("auth-required");
      const token = text(data.token);
      if (!/^[A-Za-z0-9_-]{22}$/.test(token) || !(Number(data.expires_in) > 0)) {
        throw new ZcodeAuthError("relay-unavailable");
      }
      return token;
    } catch (error) {
      if (
        generation === this.generation &&
        error instanceof ZcodeAuthError &&
        error.reason === "auth-required"
      )
        this.logout();
      throw error;
    }
  }
}
