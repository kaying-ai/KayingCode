interface DesktopTelemetryFetchSource {
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
}

export function createDesktopTelemetryFetch(source: DesktopTelemetryFetchSource): typeof fetch {
  // Electron net.fetch 不接受 URL 对象；在唯一适配入口转成 href，保留 Request 与接收者。
  return (input, init) => source.fetch(input instanceof URL ? input.href : input, init);
}
