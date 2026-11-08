import { resolveLocalizedText, type KayingCodePluginStoreListing } from "@zcode/shared";
import type { PluginComponentDisplayGroup } from "@/settings/PluginComponentGroups.js";

/** 展示元数据只能丰富已枚举的技能，不能生成技能或改变权威计数。 */
export function enrichPluginSkillGroups(
  groups: PluginComponentDisplayGroup[],
  listing: Pick<KayingCodePluginStoreListing, "skillDetails"> | undefined,
  locale: string,
): PluginComponentDisplayGroup[] {
  const details = new Map(listing?.skillDetails?.map((item) => [item.name, item]));
  return groups.map((group) =>
    group.kind !== "skill"
      ? group
      : {
          ...group,
          items: group.items.map((item) => {
            const detail = details.get(item.name);
            if (!detail) return item;
            const text = (value: { "en-US": string; "zh-CN": string }) =>
              resolveLocalizedText(locale, value["en-US"], value) ?? value["en-US"];
            return {
              ...item,
              displayName: text(detail.title),
              description: text(detail.description),
              subskills: detail.subskills?.map((child) => ({
                id: child.id,
                displayName: text(child.title),
                description: text(child.description),
              })),
            };
          }),
        },
  );
}
