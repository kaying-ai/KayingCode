// ZCode 后端的会话编排（store 耦合层）：连接 → 配对 → 工作区目录 → 工作区桥。
//
// 与 session.ts 的分工：session.ts 管 KayingCode（relay attachment），本模块管
// ZCode（zflow relay + workspace-bridge）。两条路径都只依赖 core 公开入口与
// flow 状态容器；页面不直接调 relay/zflow REST 或 socket。
//
// socket 工厂按 target 注入：weapp 用 SocketTask 适配，H5 走 core 的浏览器缺省。
import {
  ChannelBackedKayingCodeAgentService,
  RelayAgentConnection,
  describeError,
  type MobileAccount,
  type BridgeSession,
  type ZflowClient,
} from "@kayingcode/mobile-client-core";
import { appVersion } from "../ui/appVersion";
import { createTaroZflowSocket } from "../ports/zflowSocket";
import { taroPlatformPorts } from "../ports/taroPlatform";
import { flow } from "./store";
import { zcodeAuthForAccount } from "./zcodeAuth";
import {
  createZflowClient,
  describeZcodeConnectionError,
  isConnectableZcodeAccount,
  mapRelayStateToConnectionStatus,
  normalizeZcodeWorkspaces,
  type ZcodeClientDeps,
  type ZcodeWorkspace,
} from "./zcode";

const isWeapp = process.env.TARO_ENV === "weapp";
const PAIRING_TIMEOUT_MS = 60_000;
/** 开发构建把协议层日志打到 console，便于在开发者工具里定位握手/帧层问题。 */
const protocolLog =
  process.env.NODE_ENV === "production"
    ? undefined
    : (line: string) => console.log("[zflow]", line);
let openGeneration = 0;

function zcodeClientDeps(): ZcodeClientDeps {
  return {
    ...(isWeapp ? { socketFactory: createTaroZflowSocket } : {}),
    platformName: taroPlatformPorts.deviceInfo().platform,
    appVersion,
    ...(protocolLog ? { onLog: protocolLog } : {}),
  };
}

/**
 * 连接 ZCode 后端并读取工作区目录（bootstrap）。
 * 失败时释放整条会话并把错误写回壳层；成功返回归一后的工作区列表。
 */
export async function connectZcodeAccount(account: MobileAccount): Promise<ZcodeWorkspace[]> {
  if (!isConnectableZcodeAccount(account)) throw new Error("该档案不是 ZCode 连接");
  flow.resetConnection();
  flow.setActiveAccount(account.id);
  flow.setStatus("connecting");
  let client: ZflowClient | null = null;
  try {
    const auth = zcodeAuthForAccount(account);
    client = createZflowClient(account, {
      ...zcodeClientDeps(),
      ...(auth ? { getTerminalToken: () => auth.getTerminalToken() } : {}),
    });
    // relay 状态透传给壳层（`waiting` 显示为「等待桌面端批准」）。
    // 监听随会话释放：守卫用 client 身份，避免旧会话的迟到状态覆盖新会话。
    const stopStateWatch = client.relay.onState((state) => {
      if (flow.getZcodeSession()?.client !== client) return;
      flow.setStatus(mapRelayStateToConnectionStatus(state));
    });
    flow.setZcodeSession({
      client,
      bridge: null,
      workspaceKey: null,
      workspaceTarget: null,
      stopStateWatch,
      stopRecoveryWatch: () => {},
    });

    await client.connect();
    await client.waitPaired(PAIRING_TIMEOUT_MS);
    const bootstrap = await client.bootstrap();
    if (flow.getZcodeSession()?.client !== client) return [];
    flow.setStatus("paired");
    flow.setWorkspaceLabel("");
    return normalizeZcodeWorkspaces(bootstrap);
  } catch (caught) {
    if (caught instanceof Error && caught.message === "auth-required")
      zcodeAuthForAccount(account)?.logout();
    // 旧设备连接的迟到失败不能清掉用户随后建立的新连接。
    if (!client || flow.getZcodeSession()?.client === client) {
      flow.resetConnection();
      flow.setStatus("error", describeZcodeConnectionError(caught));
    }
    throw caught;
  }
}

/**
 * 打开工作区桥（workspace-bridge-open → ready）。
 * 换工作区先释放旧桥，旧桥的 rpc-frame 路由不复用（对齐 spec 的代数语义）。
 */
export async function openZcodeWorkspace(workspace: ZcodeWorkspace): Promise<void> {
  const session = flow.getZcodeSession();
  if (!session) throw new Error("ZCode 连接已丢失，请重新连接");
  const client = session.client;
  const generation = ++openGeneration;
  flow.setStatus("connecting");
  try {
    flow.getConnection()?.dispose();
    flow.setConnection(null);
    session.stopRecoveryWatch();
    session.bridge?.dispose();
    const previous = flow.getZcodeSession();
    if (!previous || previous.client !== client) return;
    flow.setZcodeSession({ ...previous, bridge: null, workspaceKey: null, workspaceTarget: null });

    const bridge = await client.openBridge(workspace.workspaceKey);
    const current = flow.getZcodeSession();
    if (!current || current.client !== client || generation !== openGeneration) {
      bridge.dispose();
      return;
    }
    const stopRecoveryWatch = bridge.onRecovered((generation) => {
      void bindZcodeBridge(client, bridge, workspace, generation).catch((caught: unknown) => {
        // 同一桥再次恢复后，上一代握手的失败也不得覆盖新代状态。
        if (flow.getZcodeSession()?.bridge === bridge && bridge.recovered === generation) {
          flow.setStatus("error", describeError(caught));
        }
      });
    });
    flow.setZcodeSession({
      ...current,
      bridge,
      workspaceKey: workspace.workspaceKey,
      workspaceTarget: {
        workspacePath: workspace.path,
        ...(workspace.workspaceIdentity ? { workspaceIdentity: workspace.workspaceIdentity } : {}),
      },
      stopRecoveryWatch,
    });
    await bindZcodeBridge(client, bridge, workspace, bridge.recovered);
  } catch (caught) {
    // 切换工作区后只允许最新一次打开操作报告错误。
    if (generation === openGeneration && flow.getZcodeSession()?.client === client) {
      flow.setStatus("error", describeError(caught));
    }
    throw caught;
  }
}

/** 桥恢复会替换 channel 栈；旧订阅和 ACK 均作废，按新代数重新握手与对账。 */
async function bindZcodeBridge(
  client: ZflowClient,
  bridge: BridgeSession,
  workspace: ZcodeWorkspace,
  generation: number,
): Promise<void> {
  const isCurrent = () => {
    const current = flow.getZcodeSession();
    return (
      current?.client === client &&
      current.bridge === bridge &&
      !bridge.isDisposed &&
      bridge.recovered === generation
    );
  };
  if (!isCurrent()) return;
  flow.setStatus("connecting");
  flow.getConnection()?.dispose();
  flow.setConnection(null);
  const target = {
    workspacePath: workspace.path,
    ...(workspace.workspaceIdentity ? { workspaceIdentity: workspace.workspaceIdentity } : {}),
  };
  const agent = new ChannelBackedKayingCodeAgentService(bridge, target);
  const connection = await RelayAgentConnection.fromAgent(agent, target);
  if (!isCurrent()) {
    connection.dispose();
    return;
  }
  await connection.reconcilePendingCommands();
  if (!isCurrent()) {
    connection.dispose();
    return;
  }
  flow.setConnection(connection);
  flow.setWorkspaceLabel(workspace.label);
  flow.setStatus("paired");
}

/** 订阅宿主推送的 workspace-list-updated；返回退订函数（无会话时为空退订）。 */
export function onZcodeWorkspaceListUpdated(
  listener: (workspaces: ZcodeWorkspace[]) => void,
): () => void {
  const session = flow.getZcodeSession();
  if (!session) return () => undefined;
  const client = session.client;
  return client.onWorkspaceListUpdated((result) => {
    if (flow.getZcodeSession()?.client !== client) return;
    listener(normalizeZcodeWorkspaces(result));
  });
}

/** 用户显式断开 ZCode 会话（与 KayingCode 的 leaveWorkspace 同义）。 */
export function disconnectZcode(): void {
  openGeneration += 1;
  flow.resetConnection();
}
