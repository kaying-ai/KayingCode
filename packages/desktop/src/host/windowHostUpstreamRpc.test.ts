import { expect, it } from "vitest";
import {
  ServiceCollection,
  IKayingCodeTaskService,
  IKayingCodeAgentService,
  IKayingCodeSessionService,
  IProjectService,
  IRemoteProjectService,
  ITaskGroupService,
} from "@zcode/services";
import {
  exposeWindowHostAttachmentServices,
  registerWebRemoteProjectChannels,
} from "./windowHostAttachmentRpcPolicy.js";
it("mobile exposes upstream channel names using the already scoped services", async () => {
  const calls: string[] = [];
  const scoped = { marker: async () => "scoped" };
  const services = new ServiceCollection()
    .register(IKayingCodeTaskService, {} as never)
    .register(IKayingCodeAgentService, {} as never)
    .register(IKayingCodeSessionService, {} as never);
  let task: any;
  exposeWindowHostAttachmentServices({
    clientMode: "web-remote-replayable",
    services,
    overrides: new Map([[IKayingCodeTaskService.channelName, scoped]]),
    server: {
      registerChannel: (name, channel) => {
        calls.push(name);
        if (name === "zcode-task") task = channel;
      },
    },
  });
  expect(calls.slice(0, 3)).toEqual(["zcode-task", "zcode-agent", "zcode-session"]);
  expect(await task.call("host", "marker")).toBe("scoped");
});
it("desktop keeps its native service names", () => {
  const calls: string[] = [];
  exposeWindowHostAttachmentServices({
    clientMode: "desktop-continuous",
    services: new ServiceCollection().register(IKayingCodeTaskService, {} as never),
    server: {
      registerChannel: (name) => {
        calls.push(name);
      },
    },
  });
  expect(calls).toEqual([IKayingCodeTaskService.channelName]);
});

it("registers controller project channels for mobile remote attachments", () => {
  const controllerProject = { marker: "project" } as never;
  const controllerRemoteProjects = { marker: "remote-project" } as never;
  const controllerTaskGroups = { marker: "task-groups" } as never;
  const windowServices = new ServiceCollection()
    .register(IProjectService, controllerProject)
    .register(IRemoteProjectService, controllerRemoteProjects)
    .register(ITaskGroupService, controllerTaskGroups);
  const services = new ServiceCollection();
  const overrides = new Map<string, unknown>();

  registerWebRemoteProjectChannels({
    services,
    windowServices,
    clientMode: "web-remote-replayable",
    attachmentScope: { kind: "remote" },
    overrides,
  });

  expect(services.getOptional(IProjectService)).toBe(controllerProject);
  expect(services.getOptional(IRemoteProjectService)).toBe(controllerRemoteProjects);
  expect(services.getOptional(ITaskGroupService)).toBe(controllerTaskGroups);
  expect(overrides.get(IProjectService.channelName)).toBe(controllerProject);
  expect(overrides.get(IRemoteProjectService.channelName)).toBe(controllerRemoteProjects);
});

it("does not replace project channels for desktop or local attachments", () => {
  const windowServices = new ServiceCollection()
    .register(IProjectService, { marker: "project" } as never)
    .register(IRemoteProjectService, { marker: "remote-project" } as never)
    .register(ITaskGroupService, { marker: "task-groups" } as never);
  for (const [clientMode, attachmentScope] of [
    ["desktop-continuous", { kind: "remote" }],
    ["web-remote-replayable", { kind: "local" }],
  ] as const) {
    const services = new ServiceCollection();
    const overrides = new Map<string, unknown>();
    registerWebRemoteProjectChannels({
      services,
      windowServices,
      clientMode,
      attachmentScope,
      overrides,
    });
    expect(services.getOptional(IProjectService)).toBeUndefined();
    expect(overrides.size).toBe(0);
  }
});
