import {
  resolveLocalizedText,
  type GameDevelopmentEngine,
  type GameDevelopmentStage,
  type GamePluginInstaller,
  type GamePluginInstallerCatalogInfo,
} from "@zcode/shared";

export interface GamePluginInstallerFilters {
  engine: GameDevelopmentEngine | "all";
  stage: GameDevelopmentStage | "all";
}

export function resolveInstallerDisplayName(
  installer: GamePluginInstaller,
  locale: string,
): string {
  return resolveLocalizedText(locale, installer.name, installer.displayName) ?? installer.name;
}

export function resolveInstallerDescription(
  installer: GamePluginInstaller,
  locale: string,
): string {
  return resolveLocalizedText(locale, "", installer.description) ?? "";
}

/**
 * 占位筛选与内置卡片一致：空 engines 匹配所有引擎；stage 取交集；
 * 搜索匹配名称、当前语言显示名/描述以及原始引擎与阶段标识。
 * 是否已安装只影响卡片状态与主操作，不把占位从专区移除。
 */
export function filterGamePluginInstallers(
  installers: readonly GamePluginInstaller[],
  filters: GamePluginInstallerFilters,
  query: string,
  locale: string,
): GamePluginInstaller[] {
  const keyword = query.trim().toLocaleLowerCase();
  return installers
    .filter((installer) => {
      if (
        filters.engine !== "all" &&
        installer.engines.length > 0 &&
        !installer.engines.includes(filters.engine)
      ) {
        return false;
      }
      if (filters.stage !== "all" && !installer.stages.includes(filters.stage)) return false;
      if (!keyword) return true;
      return [
        installer.name,
        resolveInstallerDisplayName(installer, locale),
        resolveInstallerDescription(installer, locale),
        ...installer.engines,
        ...installer.stages,
      ].some((value) => value.toLocaleLowerCase().includes(keyword));
    })
    .toSorted((left, right) =>
      resolveInstallerDisplayName(left, locale).localeCompare(
        resolveInstallerDisplayName(right, locale),
        locale,
      ),
    );
}

const INSTALL_INSTRUCTION_TEMPLATES = {
  "zh-CN": (input: { name: string; version: string; catalogUrl: string }) =>
    `请安装游戏开发插件 ${input.name}（展示版本 ${input.version}，实际版本以在线目录为准）。\n\n` +
    `1. 读取 ${input.catalogUrl}，找到 name 为 ${input.name} 的条目，按 catalog.json 的 protocol 字段与仓库 AGENTS.md 的 github-to-local-source 协议执行。\n` +
    `2. 取该条目 source.packages.kayingcode.path 指向的包，下载到用户目录 open-zcode-game-plugins/${input.name}/<版本>/kayingcode/，保留 LICENSE 与 NOTICE。\n` +
    `3. 用目录仓库的 scripts/verify-install.mjs 校验该包（name、version、marketplace.json 与插件 manifest 一致）。\n` +
    `4. 运行 kayingcode plugins install --from <本地目录> 完成安装；如果命令不可用，原样报告失败输出，不要改用远程市场或手改宿主配置。\n` +
    `5. 安装后用 kayingcode plugins list 确认已启用，并报告插件名、版本、许可、本地路径和修改过的配置。\n\n` +
    `约束：我已确认安装，无需再次询问；不要注册 GitHub 等远程市场 URL；不要执行插件自带的安装脚本；不要覆盖已安装的同名插件（如已安装请先报告）。`,
  en: (input: { name: string; version: string; catalogUrl: string }) =>
    `Install the game-development plugin ${input.name} (displayed version ${input.version}; the online catalog is authoritative).\n\n` +
    `1. Read ${input.catalogUrl} and find the entry named ${input.name}; follow the catalog's protocol field and the repository AGENTS.md github-to-local-source protocol.\n` +
    `2. Take the package at source.packages.kayingcode.path and place it under the user home directory open-zcode-game-plugins/${input.name}/<version>/kayingcode/, keeping LICENSE and NOTICE.\n` +
    `3. Verify the package with the catalog repository scripts/verify-install.mjs (name, version, marketplace.json and plugin manifest must match).\n` +
    `4. Run kayingcode plugins install --from <local directory>; if the command is unavailable, report the raw failure and do not fall back to a remote marketplace or edit host configuration by hand.\n` +
    `5. After installing, confirm the plugin is enabled with kayingcode plugins list and report the plugin name, version, license, local path and any configuration changes.\n\n` +
    `Constraints: I already confirmed the installation, so do not ask again; do not register remote marketplace URLs such as GitHub; do not run install scripts shipped with the plugin; do not overwrite an existing installation with the same name (report it first).`,
} as const;

/** 安装指令是交给 Agent 的功能性文本；按当前界面语言选择模板，不做 Markdown 拼接。 */
export function buildGamePluginInstallerInstruction({
  installer,
  catalog,
  locale,
}: {
  installer: GamePluginInstaller;
  catalog: GamePluginInstallerCatalogInfo;
  locale: string;
}): string {
  const template = locale.toLowerCase().startsWith("zh")
    ? INSTALL_INSTRUCTION_TEMPLATES["zh-CN"]
    : INSTALL_INSTRUCTION_TEMPLATES.en;
  return template({
    name: installer.name,
    version: installer.version,
    catalogUrl: catalog.url,
  });
}
