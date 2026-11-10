import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildWebRemoteControlExternalQrUrl } from "./web-remote-control.js";

const baseUrl = "https://review-relay.kaying.ai/remote/v4";
const deviceSid = "11111111-1111-4111-8111-111111111111";
const deviceMid = "22222222-2222-4222-8222-222222222222";
const deviceName = "review-desktop-host-001";
const appVersion = "0.1.2";

describe("buildWebRemoteControlExternalQrUrl", () => {
  test("keeps sid, mid, name and app_version for the default link", () => {
    const url = new URL(
      buildWebRemoteControlExternalQrUrl({
        baseUrl,
        deviceSid,
        deviceMid,
        deviceName,
        appVersion,
      }),
    );
    assert.equal(url.searchParams.get("sid"), deviceSid);
    assert.equal(url.searchParams.get("mid"), deviceMid);
    assert.equal(url.searchParams.get("name"), deviceName);
    assert.equal(url.searchParams.get("app_version"), appVersion);
  });

  test("compact link keeps only the device sid", () => {
    const url = new URL(
      buildWebRemoteControlExternalQrUrl({
        baseUrl,
        deviceSid,
        deviceMid,
        deviceName,
        appVersion,
        compact: true,
      }),
    );
    assert.equal(url.searchParams.get("sid"), deviceSid);
    assert.equal(url.searchParams.has("mid"), false);
    assert.equal(url.searchParams.has("name"), false);
    assert.equal(url.searchParams.has("app_version"), false);
  });

  test("compact link with authorize fragment fits the 150 character review note", () => {
    const link = `${buildWebRemoteControlExternalQrUrl({
      baseUrl,
      deviceSid,
      deviceMid,
      deviceName,
      appVersion,
      compact: true,
    })}#authorize=${"a".repeat(43)}`;
    assert.ok(link.length <= 150, `compact review link is ${link.length} characters`);
  });

  test("compact link also removes stale metadata from the base URL", () => {
    const url = new URL(
      buildWebRemoteControlExternalQrUrl({
        baseUrl: `${baseUrl}?name=old&mid=old&app_version=0.0.1`,
        deviceSid,
        deviceMid,
        deviceName,
        appVersion,
        compact: true,
      }),
    );
    assert.equal(url.searchParams.has("name"), false);
    assert.equal(url.searchParams.has("mid"), false);
    assert.equal(url.searchParams.has("app_version"), false);
  });
});
