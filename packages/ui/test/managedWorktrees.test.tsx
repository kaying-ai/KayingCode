// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import {
  ManagedWorktreeCreationView,
  ManagedWorktreeComposerEntry,
  ManagedWorktreesDialog,
  managedWorktreeTestIds,
} from "@/managed-worktrees/index.js";
import {
  cleanup,
  clickAsync,
  creation,
  createService,
  group,
  query,
  render,
  rerender,
  worktreeEntry,
} from "./managedWorktreesHarness.js";

vi.mock("@/i18n/IntlProvider.js", async () => {
  const enUS = (await import("@/i18n/locales/en-US.js")).default;
  const formatMessage = (
    descriptor: { id: string },
    values?: Record<string, string | number>,
  ): string =>
    (enUS[descriptor.id] ?? descriptor.id).replace(/\{(\w+)\}/g, (_match, key: string) =>
      values?.[key] !== undefined ? String(values[key]) : `{${key}}`,
    );
  return {
    useKayingCodeIntl: () => ({
      intl: { formatMessage },
      locale: "en-US",
      localePreference: "en-US",
      setLocalePreference: () => {},
    }),
  };
});

afterEach(cleanup);

describe("ManagedWorktreeCreationView", () => {
  it("renders every phase and dispatches retry / continue / dismiss", async () => {
    const { service } = createService();
    render(
      <TooltipProvider>
        <ManagedWorktreeCreationView creation={creation()} service={service} />
      </TooltipProvider>,
    );
    expect(query(managedWorktreeTestIds.creationCard)?.textContent).toContain("Creating worktree");

    rerender(
      <TooltipProvider>
        <ManagedWorktreeCreationView
          creation={creation({ phase: "starting-session" })}
          service={service}
        />
      </TooltipProvider>,
    );
    expect(query(managedWorktreeTestIds.creationCard)?.textContent).toContain("Starting task");

    rerender(
      <TooltipProvider>
        <ManagedWorktreeCreationView
          creation={creation({ phase: "failed", error: { code: "git-failed", detail: "boom" } })}
          service={service}
        />
      </TooltipProvider>,
    );
    const card = query(managedWorktreeTestIds.creationCard);
    expect(card?.textContent).toContain("Worktree setup failed");
    expect(card?.textContent).toContain("The Git operation failed");
    expect(card?.textContent).toContain("boom");

    await clickAsync(query(managedWorktreeTestIds.creationRetry));
    expect(service.retryCreation).toHaveBeenCalledWith({ creationId: "c1" });
    await clickAsync(query(managedWorktreeTestIds.creationContinueLocal));
    expect(service.continueWithoutWorktree).toHaveBeenCalledWith({ creationId: "c1" });
    await clickAsync(query(managedWorktreeTestIds.creationDismiss));
    expect(service.dismissCreation).toHaveBeenCalledWith({ creationId: "c1" });

    // fork 失败没有"不使用 worktree"：fork 无法回落到主目录。
    rerender(
      <TooltipProvider>
        <ManagedWorktreeCreationView
          creation={creation({ kind: "fork", phase: "failed", promptText: null })}
          service={service}
        />
      </TooltipProvider>,
    );
    expect(query(managedWorktreeTestIds.creationContinueLocal)).toBeNull();
  });
});

describe("ManagedWorktreeComposerEntry", () => {
  it("keeps the entry visible but disabled when supportsWorktreeCwd is false", () => {
    render(
      <TooltipProvider>
        <ManagedWorktreeComposerEntry
          projectId="p1"
          currentBranchLabel="main"
          value={undefined}
          onChange={() => {}}
          support={{ visible: true, available: false, disabledReason: "unsupported" }}
        />
      </TooltipProvider>,
    );
    const label = query(managedWorktreeTestIds.toggle);
    const checkbox = label?.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.hasAttribute("disabled")).toBe(true);
    expect(label?.getAttribute("aria-disabled")).toBe("true");
    expect(label?.getAttribute("title")).toContain("doesn't support worktrees");
    expect(document.querySelector("[data-worktree-branch-picker]")).toBeNull();
  });

  it("renders the entry enabled and the branch picker when the capability flips to true", () => {
    render(
      <TooltipProvider>
        <ManagedWorktreeComposerEntry
          projectId="p1"
          currentBranchLabel="main"
          value={null}
          onChange={() => {}}
          support={{ visible: true, available: true, disabledReason: null }}
        />
      </TooltipProvider>,
    );
    const label = query(managedWorktreeTestIds.toggle);
    const checkbox = label?.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.hasAttribute("disabled")).toBe(false);
    expect(label?.getAttribute("aria-disabled")).toBeNull();
    expect(document.querySelector("[data-worktree-branch-picker]")).not.toBeNull();
  });
});

describe("ManagedWorktreesDialog removal", () => {
  it("shows the resident-session reason and keeps the row when removal is refused", async () => {
    const onReload = vi.fn();
    const { service } = createService({
      removeWorktree: vi.fn(async () => ({
        ok: false as const,
        error: { code: "worktree-in-use" as const, detail: "running" },
      })),
    });
    render(
      <TooltipProvider>
        <ManagedWorktreesDialog
          open
          onOpenChange={() => {}}
          projectId="p1"
          projectName="Repo"
          service={service}
          groups={[group([worktreeEntry()])]}
          loading={false}
          loadError={null}
          onReload={onReload}
        />
      </TooltipProvider>,
    );
    await clickAsync(query(managedWorktreeTestIds.delete));
    await clickAsync(query(managedWorktreeTestIds.deleteConfirmAction));

    expect(service.removeWorktree).toHaveBeenCalledWith({
      projectId: "p1",
      path: "/managed/3f2a/repo",
    });
    expect(query(managedWorktreeTestIds.rowError)?.textContent).toContain("A task is running");
    // 失败不重新读取、不在本地删行：列表仍是 Host 上一次的快照。
    expect(onReload).not.toHaveBeenCalled();
    expect(query(managedWorktreeTestIds.row)).not.toBeNull();
  });

  it("localizes release-unsupported instead of retrying", async () => {
    const onReload = vi.fn();
    const { service } = createService({
      removeWorktree: vi.fn(async () => ({
        ok: false as const,
        error: { code: "release-unsupported" },
      })),
    });
    render(
      <TooltipProvider>
        <ManagedWorktreesDialog
          open
          onOpenChange={() => {}}
          projectId="p1"
          service={service}
          groups={[group([worktreeEntry()])]}
          loading={false}
          loadError={null}
          onReload={onReload}
        />
      </TooltipProvider>,
    );
    await clickAsync(query(managedWorktreeTestIds.delete));
    await clickAsync(query(managedWorktreeTestIds.deleteConfirmAction));

    expect(query(managedWorktreeTestIds.rowError)?.textContent).toContain(
      "can't unload resident sessions",
    );
    expect(onReload).not.toHaveBeenCalled();
    expect(query(managedWorktreeTestIds.row)).not.toBeNull();
  });

  it("reloads after a successful removal and never mutates the list locally", async () => {
    const onReload = vi.fn();
    const { service } = createService();
    render(
      <TooltipProvider>
        <ManagedWorktreesDialog
          open
          onOpenChange={() => {}}
          projectId="p1"
          service={service}
          groups={[group([worktreeEntry()])]}
          loading={false}
          loadError={null}
          onReload={onReload}
        />
      </TooltipProvider>,
    );
    await clickAsync(query(managedWorktreeTestIds.delete));
    await clickAsync(query(managedWorktreeTestIds.deleteConfirmAction));

    expect(onReload).toHaveBeenCalledTimes(1);
    // 行只在重新读取后消失；UI 不乐观删除。
    expect(query(managedWorktreeTestIds.row)).not.toBeNull();
  });
});
