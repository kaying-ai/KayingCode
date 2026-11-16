import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { sha256 } from "../lib/json.js";

export interface HttpClientOptions {
  baseUrl?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  rawDir?: string | null;
  userAgent?: string;
  /** Cloudflare Worker proxy origin, e.g. https://taptap-proxy.opentaptap.dev */
  proxyBaseUrl?: string | null;
  /** Bearer token for the proxy; never written to snapshots or logs. */
  proxyToken?: string | null;
}

export interface JsonResponse<T> {
  data: T;
  rawText: string;
  url: string;
  rawFile: string | null;
  rawSha256: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TapTapHttpClient {
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly rawDir: string | null;
  private readonly userAgent: string;
  private readonly proxyBaseUrl: string | null;
  private readonly proxyToken: string | null;
  private uid = randomUUID();
  private nextAllowedAt = 0;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.taptap.cn").replace(/\/+$/, "");
    this.minIntervalMs = options.minIntervalMs ?? 350;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.rawDir = options.rawDir ?? null;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.proxyBaseUrl = options.proxyBaseUrl?.replace(/\/+$/, "") || null;
    this.proxyToken = options.proxyToken || null;
    if (this.proxyBaseUrl && !this.proxyToken) {
      throw new Error("proxyToken is required when proxyBaseUrl is set");
    }
  }

  private xua(): string {
    return [
      "V=1",
      "PN=WebApp",
      "LANG=zh_CN",
      "VN_CODE=100000000",
      "LOC=CN",
      "PLT=PC",
      "DS=Android",
      `UID=${this.uid}`,
      "OS=Linux",
      "OSV=x86_64",
      "DT=PC",
    ].join("&");
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    if (now < this.nextAllowedAt) {
      await sleep(this.nextAllowedAt - now);
    }
    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }

  private buildRequest(
    path: string,
    params: Record<string, string | number | undefined>,
  ): { url: string; proxied: boolean } {
    const target = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
    target.searchParams.set("X-UA", this.xua());
    if (!this.proxyBaseUrl) {
      return { url: target.toString(), proxied: false };
    }
    const proxy = new URL("/fetch", this.proxyBaseUrl);
    proxy.searchParams.set("path", `${target.pathname}${target.search}`);
    return { url: proxy.toString(), proxied: true };
  }

  private async storeRaw(
    rawText: string,
    url: string,
    store: boolean,
  ): Promise<{ rawFile: string | null; rawSha256: string }> {
    const rawSha256 = sha256(rawText);
    if (!this.rawDir || !store) return { rawFile: null, rawSha256 };
    await mkdir(this.rawDir, { recursive: true });
    const file = join(this.rawDir, `${sha256(url).slice(0, 16)}.json`);
    await writeFile(file, rawText, "utf8");
    return { rawFile: relative(process.cwd(), file), rawSha256 };
  }

  async getJson<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    referer = "https://www.taptap.cn/",
    options: { storeRaw?: boolean } = {},
  ): Promise<JsonResponse<T>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitForSlot();
      const request = this.buildRequest(path, params);
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        Referer: referer,
        Accept: "application/json",
      };
      if (request.proxied) {
        headers.Authorization = `Bearer ${this.proxyToken!}`;
      } else {
        headers["X-Requested-With"] = "XMLHttpRequest";
      }
      try {
        const response = await fetch(request.url, {
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const rawText = await response.text();
        if (
          response.status === 400 &&
          /INVALID_XUA|invalid_xua/i.test(rawText) &&
          attempt < this.maxRetries
        ) {
          this.uid = randomUUID();
          continue;
        }
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          await sleep(1_000 * 2 ** attempt + Math.floor(Math.random() * 250));
          continue;
        }
        if (!response.ok) {
          throw new Error(
            `TapTap request failed: HTTP ${response.status} ${request.url}\n${rawText.slice(0, 500)}`,
          );
        }
        const parsed = JSON.parse(rawText) as {
          success?: boolean;
          data?: T;
          msg?: string;
          error?: string;
        };
        if (parsed.success === false) {
          throw new Error(
            `TapTap API returned success=false ${request.url}: ${parsed.error ?? parsed.msg ?? "unknown error"}`,
          );
        }
        if (parsed.data === undefined) {
          throw new Error(`TapTap API response has no data: ${request.url}`);
        }
        const raw = await this.storeRaw(rawText, request.url, options.storeRaw ?? true);
        return { data: parsed.data, rawText, url: request.url, ...raw };
      } catch (error) {
        lastError = error;
        if (
          attempt < this.maxRetries &&
          !(error instanceof Error && error.message.startsWith("TapTap request failed: HTTP 4"))
        ) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
