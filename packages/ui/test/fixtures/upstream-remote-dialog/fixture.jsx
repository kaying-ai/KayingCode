import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { KayingCodeIntlProvider } from "../../../src/i18n/IntlProvider.js";
import { PlatformProvider } from "../../../src/hooks/usePlatform.js";
import { ServiceProvider } from "../../../src/hooks/useServices.js";
import { TooltipProvider } from "../../../src/components/ui/tooltip.js";
import { WebRemoteControlDialog } from "../../../src/web-remote-control/WebRemoteControlDialog.js";
import "./styles.css";
document.documentElement.classList.add("dark", "theme-zai-dark");
let status = { status: "idle" };
let startGate;
let sequence = 0;
const bots = [];
window.fixture = {
  starts: [],
  stops: 0,
  copied: [],
  savedBots: [],
  holdStart: false,
  failStop: false,
  status: (value) => {
    status = value;
  },
  releaseStart: (value) => {
    status = value;
    startGate?.(value);
  },
};
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (value) => window.fixture.copied.push(value) },
});
const running = () => ({
  status: "running",
  sessionId: `sid-${++sequence}`,
  windowControlSessionId: `sid-${sequence}`,
  workspacePath: "/fixture",
  workspaceIdentity: "fixture-identity",
  remoteSessionId: "fixture-remote",
  connectUrl: `https://relay.example.test/remote/v4?sid=${sequence}#authorize=${"A".repeat(43)}`,
  qrUrl: `https://relay.example.test/remote/v4?sid=${sequence}#authorize=${"A".repeat(43)}`,
});
const platform = {
  getWebRemoteControlStatus: async () => status,
  startWebRemoteControl: async (context) => {
    window.fixture.starts.push(context);
    if (window.fixture.holdStart)
      return new Promise((resolve) => {
        startGate = resolve;
      });
    status = running();
    return status;
  },
  stopWebRemoteControl: async () => {
    window.fixture.stops++;
    if (window.fixture.failStop) throw new Error("fixture stop failure");
    status = { status: "idle" };
  },
  executeDesktopCommand: async () => {},
  openExternal: () => {},
};
const broadcastService = { onMessage: () => ({ dispose() {} }), send: async () => {} };
const botsService = {
  getConfig: async () => ({ version: 3, bots: [...bots] }),
  getStatus: async () => ({
    botsCount: bots.length,
    enabledBotsCount: bots.length,
    contextsCount: 0,
    botRuntime: [],
  }),
  listWorkspaceRefs: async () => [],
  getBotStates: async () => [],
  saveBot: async ({ bot }) => {
    bots.push(bot);
    window.fixture.savedBots.push(bot.provider);
    return bot;
  },
};
function Fixture() {
  const [open, setOpen] = useState(true);
  const [available, setAvailable] = useState(true);
  window.fixture.open = setOpen;
  window.fixture.available = setAvailable;
  return (
    <ServiceProvider
      services={{ botsService: available ? botsService : undefined, broadcastService }}
    >
      <button onClick={() => setOpen(true)}>Open remote</button>
      <WebRemoteControlDialog
        open={open}
        onOpenChange={setOpen}
        workspacePath="/fixture"
        workspaceIdentity="fixture-identity"
        remoteSessionId="fixture-remote"
        initialTaskId="fixture-task"
      />
    </ServiceProvider>
  );
}
createRoot(document.getElementById("root")).render(
  <TooltipProvider>
    <KayingCodeIntlProvider initialLocale="zh-CN">
      <PlatformProvider platform={platform}>
        <Fixture />
      </PlatformProvider>
    </KayingCodeIntlProvider>
  </TooltipProvider>,
);
