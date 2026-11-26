// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useManagedWorktreeCreations,
  useManagedWorktreeList,
  type IManagedWorktreeService,
  type ManagedWorktreeGroup,
} from "@/managed-worktrees/index.js";
import {
  cleanup,
  creation,
  createService,
  deferred,
  group,
  query,
  render,
  rerender,
  settle,
  worktreeEntry,
} from "./managedWorktreesHarness.js";

vi.mock("@/i18n/IntlProvider.js", async () => {
  const enUS = (await import("@/i18n/locales/en-US.js")).default;
  const formatMessage = (descriptor: { id: string }): string =>
    enUS[descriptor.id] ?? descriptor.id;
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

function CreationsProbe({ service }: { service: IManagedWorktreeService }) {
  const creations = useManagedWorktreeCreations(service);
  return <div data-testid="creations">{creations.map((item) => item.id).join(",")}</div>;
}

function GroupsProbe({
  service,
  refreshKey,
}: {
  service: IManagedWorktreeService;
  refreshKey: string;
}) {
  const state = useManagedWorktreeList(service, "p1", refreshKey);
  return (
    <div data-testid="groups">
      {state.groups?.map((item) => item.sourceRoot).join(",") ?? "null"}
    </div>
  );
}

describe("snapshot generations", () => {
  it("ignores an initial list snapshot that resolves after a pushed update", async () => {
    const initial = deferred<Awaited<ReturnType<IManagedWorktreeService["listCreations"]>>>();
    const { service, emitChanges } = createService({
      listCreations: vi.fn(() => initial.promise),
    });
    render(<CreationsProbe service={service} />);
    await act(async () => {
      emitChanges([creation({ id: "pushed" })]);
    });
    await settle();
    expect(query("creations")?.textContent).toBe("pushed");

    initial.resolve([creation({ id: "stale" })]);
    await settle();
    expect(query("creations")?.textContent).toBe("pushed");
  });

  it("drops results and pushes from a previous service generation", async () => {
    const first = deferred<Awaited<ReturnType<IManagedWorktreeService["listCreations"]>>>();
    const second = deferred<Awaited<ReturnType<IManagedWorktreeService["listCreations"]>>>();
    const firstService = createService({ listCreations: vi.fn(() => first.promise) });
    const secondService = createService({ listCreations: vi.fn(() => second.promise) });
    render(<CreationsProbe service={firstService.service} />);
    rerender(<CreationsProbe service={secondService.service} />);
    second.resolve([creation({ id: "second" })]);
    await settle();
    expect(query("creations")?.textContent).toBe("second");

    first.resolve([creation({ id: "first" })]);
    await act(async () => {
      firstService.emitChanges([creation({ id: "first" })]);
    });
    await settle();
    expect(query("creations")?.textContent).toBe("second");
  });

  it("only applies the latest worktree list read", async () => {
    const first = deferred<{ groups: ManagedWorktreeGroup[] }>();
    const second = deferred<{ groups: ManagedWorktreeGroup[] }>();
    const listWorktrees = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { service } = createService({ listWorktrees });
    render(<GroupsProbe service={service} refreshKey="one" />);
    rerender(<GroupsProbe service={service} refreshKey="two" />);

    second.resolve({ groups: [group([worktreeEntry()])] });
    await settle();
    expect(query("groups")?.textContent).toBe("/repo");

    first.resolve({ groups: [{ sourceRoot: "/stale", worktrees: [] }] });
    await settle();
    expect(query("groups")?.textContent).toBe("/repo");
  });
});
