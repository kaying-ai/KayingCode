import { z } from "zod";

const text = z.string().trim().min(1);
export const TAPMAKER_PROJECTS_MCP_TOOL = "kaying-for-taptap_manage_projects";
export const tapMakerProjectSchema = z.strictObject({
  id: text,
  name: text,
  localDirectory: text.nullable(),
  createdAt: z.string().nullable(),
  lastAccessedAt: z.string().nullable(),
  lastConversationAt: z.string().nullable(),
  gameType: z.string().nullable(),
  stage: z.string().nullable(),
  pinnedAt: z.string().nullable(),
});
export const tapMakerProjectsRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list"), candidateDirectories: z.array(text).max(500) }),
  z.strictObject({ action: z.literal("authorize") }),
  z.strictObject({
    action: z.literal("restore"),
    appId: text,
    projectName: text,
    selectedDirectory: text,
  }),
]);
export const tapMakerProjectsResultSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list"), projects: z.array(tapMakerProjectSchema) }),
  z.strictObject({ action: z.literal("authorize") }),
  z.strictObject({ action: z.literal("restore"), projectRoot: text }),
]);
export type TapMakerProject = z.infer<typeof tapMakerProjectSchema>;
export type TapMakerProjectsRequest = z.infer<typeof tapMakerProjectsRequestSchema>;
export type TapMakerProjectsResult = z.infer<typeof tapMakerProjectsResultSchema>;
