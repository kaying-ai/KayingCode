import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "../../../src/components/ui/tooltip.js";
import { KayingCodeIntlProvider } from "../../../src/i18n/IntlProvider.js";
import { PlatformProvider } from "../../../src/hooks/usePlatform.js";
import { WorkspaceHelpMenuButton } from "../../../src/WorkspaceHelpMenuButton.js";
import { useFeedbackStore } from "../../../src/feedback/feedbackStore.js";
import "./styles.css";

window.fixture = { commands: [] };
const platform = {
  captureWindowScreenshot: async () => null,
  exportLogs: async () => null,
  openExternal: () => undefined,
  executeDesktopCommand: async (command) => {
    window.fixture.commands.push(command);
  },
  getUpdateState: async () => ({ kind: "idle", enabled: true }),
  onUpdateStateChanged: () => () => undefined,
};

function FeedbackStateProbe() {
  const issueOpen = useFeedbackStore((state) => state.open);
  const featureOpen = useFeedbackStore((state) => state.featureRequestOpen);
  return (
    <div>
      <span data-testid="issue-state">{issueOpen ? "open" : "closed"}</span>
      <span data-testid="feature-state">{featureOpen ? "open" : "closed"}</span>
    </div>
  );
}

function Fixture() {
  return (
    <main className="flex min-h-screen justify-end bg-background p-4 text-foreground">
      <div>
        <WorkspaceHelpMenuButton isDesktop />
        <FeedbackStateProbe />
      </div>
    </main>
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
