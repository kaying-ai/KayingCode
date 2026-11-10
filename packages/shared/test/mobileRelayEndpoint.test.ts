import { expect, test } from "vitest";
import { buildKayingCodeEndpointUrls } from "../src/kayingcodeEndpoint.js";
import { buildWebRemoteControlExternalQrUrl } from "../src/web-remote-control.js";

test("自定义 Relay origin 同时驱动二维码链接与 V2 WebSocket 地址", () => {
  const urls = buildKayingCodeEndpointUrls("https://relay.example.com", {
    appVersion: "3.4.1",
  });

  expect(urls.origin).toBe("https://relay.example.com");
  expect(urls.remoteUrl).toBe("https://relay.example.com/remote/v4");
  expect(urls.relayWsUrl).toBe("wss://relay.example.com/api/v1/remote/ws2");

  const qr = new URL(
    buildWebRemoteControlExternalQrUrl({
      baseUrl: urls.remoteUrl,
      deviceSid: "11111111-1111-4111-8111-111111111111",
    }),
  );
  expect(qr.origin).toBe("https://relay.example.com");
  expect(qr.pathname).toBe("/remote/v4");
});
