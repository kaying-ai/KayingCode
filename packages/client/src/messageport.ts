import { MessagePortProtocol, ChannelClient } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import { RemoteServiceAccess, type RemoteServiceAccessOptions } from "./remoteServiceAccess.js";
import { isRendererProductionBuild } from "./rendererLoggingEnv.js";

function logMessagePortDebug(message: string): void {
  // 生产构建下 renderer 连接日志不输出，避免窗口启动和重连路径产生同步 console 成本。
  if (isRendererProductionBuild()) {
    return;
  }
  console.log(message);
}

export interface MessagePortServiceConnection {
  services: IServiceAccessor;
  dispose: (reason?: Error) => void;
}

/**
 * Desktop 本地 base Host 与独立 Source Server 都由 createLocalServices 注册
 * project / taskGroup / remote-project channel，因此 MessagePort 连接默认声明这三项能力。
 * windowProjectDirectory 只在 remote attachment 装配时由 Host 另建频道组，
 * sourceServerManagementService 只属于 desktop base attachment；两者仍须调用方显式声明。
 */
const LOCAL_HOST_DEFAULT_CAPABILITIES: RemoteServiceAccessOptions = {
  projectService: true,
  taskGroupService: true,
  remoteProjectService: true,
  // createLocalServices 始终注册 bots 与 output-style；source-settings attachment
  // 也依赖这两个 channel，缺省声明避免 UI 把可用服务误判为旧 Host。
  botsService: true,
  outputStyleService: true,
};

/**
 * 创建一个带明确生命周期的 MessagePort service connection。
 *
 * scoped remote session 换代时必须同时释放 ChannelClient 和底层 port，
 * 否则旧 attachment 上的挂起 RPC 无法 settle，并会继续占用上层去重状态。
 */
export function createMessagePortServiceConnection(
  port: MessagePort,
  options: RemoteServiceAccessOptions = {},
): MessagePortServiceConnection {
  logMessagePortDebug("[messageport] creating protocol and client...");
  const protocol = new MessagePortProtocol(port);
  const client = new ChannelClient(protocol);
  client.onDidInitialize(() => {
    logMessagePortDebug("[messageport] ChannelClient received Initialize from server");
  });
  logMessagePortDebug("[messageport] client created, waiting for Initialize...");

  const services = new RemoteServiceAccess(client, options);
  let disposed = false;
  return {
    services,
    dispose: (reason?: Error) => {
      if (disposed) {
        return;
      }
      disposed = true;
      client.dispose(reason);
      protocol.disconnect();
    },
  };
}

/**
 * 通过 MessagePort 连接服务。
 *
 * Desktop 模式下，utilityProcess（或 main 进程的远程代理）通过 MessagePort
 * 暴露 ChannelServer，renderer 用此函数建立 ChannelClient 连接。
 */
export function connectViaMessagePort(
  port: MessagePort,
  options: RemoteServiceAccessOptions = {},
): IServiceAccessor {
  return createMessagePortServiceConnection(port, {
    ...LOCAL_HOST_DEFAULT_CAPABILITIES,
    ...options,
  }).services;
}
