import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceSidebarItem } from "../../../src/WorkspaceSidebarItem.tsx";
import { TooltipProvider } from "../../../src/components/ui/tooltip.tsx";
import "../../../src/styles.css";

const noop = () => {};
const tab = {
  id: "project",
  type: "workspace",
  label: "Scene project",
  workspacePath: "C:/test/scene",
};
window.connectionTest = {};
function Fixture() {
  const [expanded, setExpanded] = useState(true);
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState("local");
  window.connectionTest.refresh = () => setRevision((value) => value + 1);
  window.connectionTest.connect = setConnection;
  const current =
    connection === "local"
      ? tab
      : {
          ...tab,
          workspaceIdentity: "remote:test:scene",
          remoteSessionId: connection === "connected" ? "remote-session" : undefined,
        };
  return (
    <ul style={{ width: 340 }} data-revision={revision}>
      <WorkspaceSidebarItem
        tab={current}
        isExpanded={expanded}
        isActiveWorkspace
        closeTab={noop}
        activateTab={noop}
        toggleWorkspaceExpanded={() => setExpanded(false)}
        onSelectTask={noop}
        onStartDraftInWorkspace={() => setExpanded(true)}
        taskItems={[]}
        taskListLoading={false}
        taskListHasMore={false}
        onShowMoreTasks={noop}
        reconnectingRemoteWorkspaceKeys={connection === "reconnecting" ? ["remote:test:scene"] : []}
        remoteWorkspaceErrorByWorkspaceKey={{}}
        reconnectingRemoteWorkspaceLogsByWorkspaceKey={{}}
        onReconnectRemoteWorkspace={async () => setConnection("reconnecting")}
      />
    </ul>
  );
}
document.documentElement.className = "theme-zai-dark";
createRoot(document.getElementById("root")).render(
  <TooltipProvider>
    <Fixture />
  </TooltipProvider>,
);
