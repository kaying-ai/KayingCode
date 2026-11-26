import { z } from "zod";
import {
  GAME_DEVELOPMENT_ENGINES,
  GAME_DEVELOPMENT_STAGES,
  type GameDevelopmentEngine,
  type GameDevelopmentStage,
} from "./game-development-plugin-listing.js";

/**
 * 可安装游戏插件占位：只描述社区目录中的一个插件，用于生成安装指令。
 * 不是内置插件，不进入 inventory / 安装态 / 启停判断（见
 * packages/shared/spec/game-plugin-installers.md）。
 */
export const GAME_PLUGIN_INSTALLER_LOCALES = ["zh-CN", "en"] as const;
export type GamePluginInstallerLocale = (typeof GAME_PLUGIN_INSTALLER_LOCALES)[number];

const installerNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const installerVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const installerDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/** 公开 HTTPS 地址：拒绝凭据、端口、query 与 hash，避免把安装来源指向内部服务。 */
const safeHttpsUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  },
  { message: "expected a credential-free https url without port, query or hash" },
);

const localizedTextSchema = z
  .object({
    "zh-CN": z.string().trim().min(1),
    en: z.string().trim().min(1),
  })
  .strict();

const installerSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("open-source"),
      /** 官方团队维护/官方仓库 vs 社区作者维护；决定卡片角标。 */
      tier: z.enum(["official", "community"]),
      repositoryUrl: safeHttpsUrlSchema,
    })
    .strict(),
  z.object({ kind: z.literal("closed-source") }).strict(),
]);

export const gamePluginInstallerSchema = z
  .object({
    name: installerNameSchema,
    version: installerVersionSchema,
    host: z.literal("kayingcode"),
    displayName: localizedTextSchema,
    description: localizedTextSchema,
    engines: z.array(z.enum(GAME_DEVELOPMENT_ENGINES)),
    stages: z.array(z.enum(GAME_DEVELOPMENT_STAGES)).min(1),
    source: installerSourceSchema,
    addedAt: installerDateSchema,
  })
  .strict();

export const gamePluginInstallerCatalogInfoSchema = z
  .object({
    name: installerNameSchema,
    url: safeHttpsUrlSchema.refine((value) => new URL(value).pathname.endsWith(".json"), {
      message: "catalog url must point to a json document",
    }),
    repositoryUrl: safeHttpsUrlSchema,
  })
  .strict();

export const gamePluginInstallerConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalog: gamePluginInstallerCatalogInfoSchema,
    installers: z
      .array(gamePluginInstallerSchema)
      .refine(
        (installers) =>
          new Set(installers.map((installer) => installer.name)).size === installers.length,
        { message: "duplicate installer name" },
      ),
  })
  .strict();

export type GamePluginInstaller = z.infer<typeof gamePluginInstallerSchema>;
export type GamePluginInstallerCatalogInfo = z.infer<typeof gamePluginInstallerCatalogInfoSchema>;
export type GamePluginInstallerConfig = z.infer<typeof gamePluginInstallerConfigSchema>;
export type GamePluginInstallerEngine = GameDevelopmentEngine;
export type GamePluginInstallerStage = GameDevelopmentStage;

/** 占位是否匹配引擎筛选；空 engines 表示跨引擎通用能力。 */
export function gamePluginInstallerMatchesEngine(
  installer: GamePluginInstaller,
  engine: GamePluginInstallerEngine | "all",
): boolean {
  return engine === "all" || installer.engines.length === 0 || installer.engines.includes(engine);
}

/** 占位是否匹配阶段筛选。 */
export function gamePluginInstallerMatchesStage(
  installer: GamePluginInstaller,
  stage: GamePluginInstallerStage | "all",
): boolean {
  return stage === "all" || installer.stages.includes(stage);
}
