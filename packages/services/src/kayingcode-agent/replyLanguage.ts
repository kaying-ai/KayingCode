import type { ISettingService } from "#src/setting/setting.js";

/**
 * Host 级 Agent 回复语言：回答 CLI 的 `session/readReplyLanguage`。
 * - `null` 表示未设置（CLI 会清除已有语言公告）；
 * - 读取失败应抛错，由 CLI 按读取失败跳过本轮，不能把失败伪装成「清除」。
 */
export type ReplyLanguageResolver = () => string | null | Promise<string | null>;

/**
 * Web / 远端 Host 的回复语言来源：读取本 Host 的 Setting 事实。
 * 设置页按当前 active Host 通过既有 ISettingService 写入，因此不需要平行推送通道；
 * 未设置时回答 null，不伪造默认语言。
 */
export function createSettingServiceReplyLanguageResolver(
  settingService: Pick<ISettingService, "get">,
): () => Promise<string | null> {
  return async () => (await settingService.get()).replyLanguage ?? null;
}
