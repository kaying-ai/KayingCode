import { z } from "zod";

/**
 * KayingCode agent 提供方的单一真源。
 *
 * 类型 KayingCodeProvider、运行时 schema kayingcodeProviderSchema 都从这里派生,
 * 避免各处内联 z.enum([...]) 副本随新增/删除 provider 漂移。
 * 本模块只依赖 zod(叶子),可被 validation / kayingcode-protocol 等无环引用。
 */
export const KAYINGCODE_PROVIDERS = ["glm"] as const;

export const kayingcodeProviderSchema = z.enum(KAYINGCODE_PROVIDERS);

export type KayingCodeProvider = (typeof KAYINGCODE_PROVIDERS)[number];
