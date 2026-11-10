import { expect, test } from "vitest";
import { isKnownMobileHost, parseMobileConnection } from "./mobileConnectionParams.js";
import { zflowRelayWsUrl } from "./zcode/zflowParams.js";
test("only current V2 and complete self-hosted Web authorization links are accepted", () => {
  const official = parseMobileConnection(
    "https://zcode.z.ai/remote/v4?sid=fixture&mid=machine&name=Computer",
  );
  expect(official?.zcodeProtocol).toBe("v2");
  expect(zflowRelayWsUrl(official!)).toBe("wss://zcode.z.ai/api/v1/remote/ws2?mid=machine");
  const web = parseMobileConnection(
    `https://relay.example.com/remote/v4?sid=fixture#authorize=${"a".repeat(43)}`,
  );
  expect(web?.webEntryVersion).toBe(2);
  expect(web?.backendType).toBe("kayingcode");
  for (const raw of [
    "https://relay.example.com#pairing#secret",
    "https://relay.example.com/remote/v4?sid=fixture&hash=old&t=1",
    "https://relay.example.com/remote/v4?sid=fixture&t=1",
    "https://relay.example.com/remote/v4?sid=fixture&hash=old",
    "http://relay.example.com/remote/v4?sid=fixture",
    "https://relay.example.com/remote/?relay&bot=old#v=1&pairing=old",
    "https://relay.example.com/remote/v4?sid=fixture#authorize=invalid",
  ])
    expect(parseMobileConnection(raw), raw).toBeNull();
});
test("review origins prompt as unknown hosts while known subdomains skip the confirmation", () => {
  const review = parseMobileConnection(
    `https://review.example.com/remote/v4?sid=fixture#authorize=${"a".repeat(43)}`,
  )!;
  expect(isKnownMobileHost(review)).toBe(false);
  const known = parseMobileConnection(
    `https://review.kayingai.com/remote/v4?sid=fixture#authorize=${"a".repeat(43)}`,
  )!;
  expect(isKnownMobileHost(known)).toBe(true);
});
