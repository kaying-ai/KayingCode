import { z } from "zod";
import { modelSelectionSchema } from "../model-selection.js";

/** Relay 移动 attachment 的专用只读目录；原始 ModelSelectionView 含密钥，不得透传。 */
export const MOBILE_MODEL_CATALOG_CHANNEL = "kayingcode-mobile-model-catalog";

export const mobileModelCatalogSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    providers: z.array(z.object({
      providerId: z.string().min(1),
      providerName: z.string().min(1),
      models: z.array(z.object({
        modelId: z.string().min(1),
        reasoningLevels: z.array(z.string().min(1)),
      }).strict()),
    }).strict()),
    preferredSelection: modelSelectionSchema.optional(),
  })
  .strict();

export type MobileModelCatalog = z.infer<typeof mobileModelCatalogSchema>;
