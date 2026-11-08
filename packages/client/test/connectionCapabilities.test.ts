import assert from "node:assert/strict";
import { test } from "vitest";
import { Event, type IMessagePassingProtocol } from "@zcode/rpc";
import { connectViaProtocol } from "../src/websocket.js";

function silentProtocol(): IMessagePassingProtocol {
  return { send: () => {}, onMessage: Event.None };
}

test("WebSocket/protocol connections declare the Web Host project capabilities by default", () => {
  const services = connectViaProtocol(silentProtocol());
  assert.ok(services.projectService, "projectService should be proxied by default");
  assert.ok(services.taskGroupService, "taskGroupService should be proxied by default");
  assert.ok(services.remoteProjectService, "remoteProjectService should be proxied by default");
  assert.ok(services.botsService, "botsService should be proxied by default");
  assert.ok(services.outputStyleService, "outputStyleService should be proxied by default");
  // source-server-workspace 只在 Source 宿主注册，不能由 Web 默认伪造代理。
  assert.equal(services.sourceServerWorkspaceService, undefined);
  // attachment 级能力仍需显式声明，避免旧 Host 在构造期出现假代理。
  assert.equal(services.windowProjectDirectory, undefined);
  assert.equal(services.sourceServerManagementService, undefined);
  // Web Host 没有窗口级 controller：关闭后 UI 走 task service 事件降级。
  assert.equal(services.windowControllerService, undefined);
});

test("window controller stays opt-in for hosts that provide it", () => {
  const services = connectViaProtocol(silentProtocol(), { windowControllerService: true });
  assert.ok(services.windowControllerService);
});

test("Source Server attachment capabilities stay opt-in", () => {
  const services = connectViaProtocol(silentProtocol(), {
    sourceServerWorkspaceService: true,
  });
  assert.ok(services.sourceServerWorkspaceService);
  assert.equal(services.botsService, undefined);
  assert.equal(services.outputStyleService, undefined);
});

test("explicit capability flags override project defaults for older Hosts", () => {
  const services = connectViaProtocol(silentProtocol(), {
    projectService: false,
    taskGroupService: false,
    remoteProjectService: false,
  });
  assert.equal(services.projectService, undefined);
  assert.equal(services.taskGroupService, undefined);
  assert.equal(services.remoteProjectService, undefined);
});
