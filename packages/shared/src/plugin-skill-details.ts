import { z } from "zod";

const localizedText = z
  .object({
    "en-US": z.string().trim().min(1).max(2000),
    "zh-CN": z.string().trim().min(1).max(2000),
  })
  .strict();

const subskillSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: localizedText,
    description: localizedText,
  })
  .strict();

export const pluginSkillDetailsSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(120),
        title: localizedText,
        description: localizedText,
        subskills: z.array(subskillSchema).max(32).optional(),
      })
      .strict(),
  )
  .max(64)
  .superRefine((items, context) => {
    const names = new Set<string>();
    items.forEach((item, index) => {
      if (names.has(item.name))
        context.addIssue({
          code: "custom",
          message: "Duplicate skill name",
          path: [index, "name"],
        });
      names.add(item.name);
      const ids = new Set<string>();
      item.subskills?.forEach((child, childIndex) => {
        if (ids.has(child.id))
          context.addIssue({
            code: "custom",
            message: "Duplicate subskill id",
            path: [index, "subskills", childIndex, "id"],
          });
        ids.add(child.id);
      });
    });
  });

export type PluginSkillDetails = z.infer<typeof pluginSkillDetailsSchema>;
