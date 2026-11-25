const PROCESS_NAME_PREFIX = "kayingcode";
const MCP_PROCESS_NAME = `${PROCESS_NAME_PREFIX}-mcp`;
const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export const CLI_COMMAND_NAME = PROCESS_NAME_PREFIX;
export const CLI_PROCESS_NAME = `${PROCESS_NAME_PREFIX}-cli`;

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};

// __kayingcode-plugin-host 复用 CLI 入口，但承载的是插件 MCP server 而不是 Agent。
// 若沿用统一改名，插件宿主会在 ps / 进程面板里显示成 kayingcode-cli，被误认成 Agent；
// 上游 4.0.0 因此在加载插件前按角色命名。插件名只能来自 resolver 权威写入的插件身份，
// 且必须通过字符白名单后才拼进进程名：非法/缺失值回退 kayingcode-mcp，不从路径猜测，
// 避免任意环境变量伪造出看起来可信的进程名（该名称仅用于展示，不参与鉴权）。
export const setPluginHostProcessTitle = (
  pluginId: string | undefined,
  target: ProcessTitleTarget = process,
): void => {
  const pluginName = pluginId?.split("@", 1)[0]?.trim().toLowerCase();
  target.title =
    pluginName && PLUGIN_NAME_PATTERN.test(pluginName)
      ? `${MCP_PROCESS_NAME}-${pluginName}`
      : MCP_PROCESS_NAME;
};
