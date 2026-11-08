import { expect, test } from "vitest";
import { parseMobileConnection } from "./mobileConnectionParams.js";
import { zflowRelayWsUrl } from "./zcode/zflowParams.js";
test("only current V2 and complete self-hosted Web authorization links are accepted", () => {
  const official = parseMobileConnection("https://zcode.z.ai/remote/v4?sid=fixture&mid=machine&name=Computer");
  expect(official?.zcodeProtocol).toBe("v2");
  expect(zflowRelayWsUrl(official!)).toBe("wss://zcode.z.ai/api/v1/remote/ws2?mid=machine");
  const web = parseMobileConnection(`https://relay.example.com/remote/v4?sid=fixture#authorize=${"a".repeat(43)}`);
  expect(web?.webEntryVersion).toBe(2);
  expect(web?.backendType).toBe("kayingcode");
  for (const raw of ["https://relay.example.com#pairing#secret", "https://relay.example.com/remote/v4?sid=fixture&hash=old&t=1", "https://relay.example.com/remote/v4?sid=fixture&t=1", "https://relay.example.com/remote/v4?sid=fixture&hash=old", "http://relay.example.com/remote/v4?sid=fixture", "https://relay.example.com/remote/?relay&bot=old#v=1&pairing=old", "https://relay.example.com/remote/v4?sid=fixture#authorize=invalid"]) expect(parseMobileConnection(raw), raw).toBeNull();
});
