// App 侧插件宿主查询：plugins/readUserOptions 与 plugins/mentionItems（plugin-host-queries 模块）。
// 两个方法的暴露面不同：
// - getPluginMentionItems 挂在 IKayingCodeAgentService 上，工具调用走会话的授权链。
// - readPluginUserOptions 只在 Window Host 进程内，由 node.ts 侧表取出后交给扩展网关，不登记为服务。
import {
  kayingcodeProtocolMethods,
  zcodePluginsMentionItemsParamsSchema,
  zcodePluginsMentionItemsResultSchema,
  zcodePluginsReadUserOptionsParamsSchema,
  zcodePluginsReadUserOptionsResultSchema,
  type ZCodePluginsReadUserOptionsResult,
} from "@zcode/shared";
import type {
  KayingCodeAgentPluginMentionItemsParams,
  KayingCodeAgentPluginMentionItemsResult,
  KayingCodeAgentWorkspaceTarget,
} from "#src/kayingcode-agent/kayingcodeAgentPluginParams.js";
import type { KayingCodeProtocolClient } from "#src/kayingcode-agent/kayingcodeProtocolClient.js";

/** JSON-RPC method-not-found：旧 CLI 不认识查询方法。 */
const METHOD_NOT_FOUND_CODE = -32601;

export interface KayingCodeAgentReadPluginUserOptionsParams {
  pluginId: string;
}

/** `supported: false`：旧 CLI 没有 plugins/readUserOptions，调用方只用非敏感值。 */
export type KayingCodeAgentPluginUserOptionsResult =
  | { supported: true; values: ZCodePluginsReadUserOptionsResult["values"] }
  | { supported: false };

/** 只在 Window Host 进程内持有；不登记为服务、不挂在任何服务对象上。 */
export interface PluginUserOptionsReader {
  readPluginUserOptions(
    params: KayingCodeAgentReadPluginUserOptionsParams,
  ): Promise<KayingCodeAgentPluginUserOptionsResult>;
}

export interface PluginHostQueriesClientDeps {
  /** 插件管理面的本机 CLI：user 层设置与工作区无关。 */
  getPluginManagementClient(): Promise<KayingCodeProtocolClient>;
  /** existing-only：持有会话的工作区 CLI；没有运行中的 CLI 时抛 runtime-unavailable，不启动进程。 */
  getExistingClient(target: KayingCodeAgentWorkspaceTarget): Promise<KayingCodeProtocolClient>;
}

export interface PluginHostQueriesClient extends PluginUserOptionsReader {
  getPluginMentionItems(
    params: KayingCodeAgentPluginMentionItemsParams,
  ): Promise<KayingCodeAgentPluginMentionItemsResult>;
}

export function createPluginHostQueriesClient(
  deps: PluginHostQueriesClientDeps,
): PluginHostQueriesClient {
  return {
    async readPluginUserOptions(params) {
      const wire = zcodePluginsReadUserOptionsParamsSchema.parse({ pluginId: params.pluginId });
      const client = await deps.getPluginManagementClient();
      try {
        const result = await client.request(
          kayingcodeProtocolMethods.pluginsReadUserOptions,
          wire,
          zcodePluginsReadUserOptionsResultSchema,
        );
        return { supported: true, values: result.values };
      } catch (error) {
        // 旧 CLI：当作「不支持」，不是错误。其他错误（如 data.code plugin_not_found）向上抛。
        if (isMethodNotFoundError(error)) return { supported: false };
        throw error;
      }
    },
    async getPluginMentionItems(params) {
      const wire = zcodePluginsMentionItemsParamsSchema.parse({
        sessionId: params.sessionId,
        pluginId: params.pluginId,
        tool: params.tool,
        query: params.query,
      });
      const client = await deps.getExistingClient(params);
      try {
        const result = await client.request(
          kayingcodeProtocolMethods.pluginsMentionItems,
          wire,
          zcodePluginsMentionItemsResultSchema,
          // 首次调用可能在会话里等用户审批（CLI 不设超时）；超时只让这次查询失败，
          // 不能按默认语义上报「连接不可信」，否则进程管理器会回收整个工作区的 CLI。
          { invalidateConnectionOnTimeout: false },
        );
        return { supported: true, items: result.items };
      } catch (error) {
        if (isMethodNotFoundError(error)) return { supported: false };
        throw error;
      }
    },
  };
}

function isMethodNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === METHOD_NOT_FOUND_CODE
  );
}
