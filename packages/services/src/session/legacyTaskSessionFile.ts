import type { KayingCodeSessionFile, KayingCodeTaskMeta } from "@zcode/shared";
import { kayingcodeSessionFileSchema, kayingcodeTaskMetaSchema, kayingcodeTaskModeSchema } from "@zcode/shared";

export type LegacyTaskSessionFile = Omit<KayingCodeSessionFile, "meta"> & {
  meta: Omit<KayingCodeTaskMeta, "mode"> & { mode?: KayingCodeTaskMeta["mode"] };
};

const legacyTaskSessionFileSchema = kayingcodeSessionFileSchema.extend({
  // Claude 原生迁移会按清洗路径删除 meta.mode。
  // legacy snapshot 读取/写入仍要校验其它必需字段，但不能再强制把被过滤字段补回文件。
  meta: kayingcodeTaskMetaSchema.extend({
    mode: kayingcodeTaskModeSchema.optional(),
  }),
});

export function parseLegacyTaskSessionFile(input: unknown): LegacyTaskSessionFile {
  return legacyTaskSessionFileSchema.parse(input);
}

export function safeParseLegacyTaskSessionFile(input: unknown) {
  return legacyTaskSessionFileSchema.safeParse(input);
}
