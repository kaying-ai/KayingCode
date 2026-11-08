import type { KayingCodeProvider } from "@zcode/shared";

// 修复原因：目录已包含 guarded，映射遗漏会让中文菜单回退成英文并丢失说明。
export const KAYINGCODE_MODE_OPTION_LABEL_IDS: Record<
  KayingCodeProvider,
  Record<string, string>
> = {
  glm: {
    build: "mode.label.glm.build",
    guarded: "mode.label.glm.guarded",
    edit: "mode.label.glm.edit",
    plan: "mode.label.glm.plan",
    yolo: "mode.label.glm.yolo",
  },
};

export const KAYINGCODE_MODE_OPTION_DESCRIPTION_IDS: Record<
  KayingCodeProvider,
  Record<string, string>
> = {
  glm: {
    build: "mode.description.glm.build",
    guarded: "mode.description.glm.guarded",
    edit: "mode.description.glm.edit",
    plan: "mode.description.glm.plan",
    yolo: "mode.description.glm.yolo",
  },
};
