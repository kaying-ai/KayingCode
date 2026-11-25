import type { IPlatformService } from "@zcode/shared";

/**
 * 语音输入是否显示入口的唯一推导（packages/desktop/spec/composer-voice-input.md「范围」「Web / 手机远端缺席」）。
 *
 * 上游把这四个条件写在 useComposerVoiceInput 的 available 里；产品把它抽成纯函数，
 * Composer 接线与测试共用同一口径，避免 Web / 手机 / 旧 preload / 缺 Host 服务时误显示入口。
 */
export interface VoiceInputAvailabilityInput {
  /** Composer 级开关（已渲染、主输入框、非内联编辑等） */
  enabled: boolean;
  /** IPlatformService 的可选麦克风能力；Web、手机远控与旧 preload 为 undefined */
  microphone: IPlatformService["microphone"] | undefined;
  /** 当前 base 连接是否提供 voiceInputService */
  serviceAvailable: boolean;
  /** 已登录才显示 */
  isLoggedIn: boolean;
}

export function isVoiceInputAvailable(input: VoiceInputAvailabilityInput): boolean {
  return Boolean(input.enabled && input.microphone && input.serviceAvailable && input.isLoggedIn);
}
