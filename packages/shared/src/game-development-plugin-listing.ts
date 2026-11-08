import { z } from "zod";

export const GAME_DEVELOPMENT_ENGINES = [
  "taptap-maker",
  "unreal",
  "unity",
  "tuanji",
  "godot",
  "threejs",
  "cocos-creator",
] as const;
export const GAME_DEVELOPMENT_STAGES = [
  "discovery",
  "development",
  "assets",
  "testing",
  "advertising",
  "publishing",
] as const;

const githubRepositoryUrlSchema = z
  .string()
  .regex(/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/?$/u)
  .refine((value) => ![".", ".."].includes(value.replace(/\/$/u, "").split("/").at(-1) ?? ""));

export const gameDevelopmentPluginListingSchema = z
  .object({
    engines: z.array(z.enum(GAME_DEVELOPMENT_ENGINES)),
    stages: z.array(z.enum(GAME_DEVELOPMENT_STAGES)).min(1),
    source: z
      .discriminatedUnion("kind", [
        z
          .object({ kind: z.literal("open-source"), repositoryUrl: githubRepositoryUrlSchema })
          .strict(),
        z.object({ kind: z.literal("closed-source") }).strict(),
      ])
      .optional(),
  })
  .strict();

export type GameDevelopmentPluginListing = z.infer<typeof gameDevelopmentPluginListingSchema>;
export type GameDevelopmentEngine = (typeof GAME_DEVELOPMENT_ENGINES)[number];
export type GameDevelopmentStage = (typeof GAME_DEVELOPMENT_STAGES)[number];
