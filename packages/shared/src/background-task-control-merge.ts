import type { KayingCodeBackgroundTaskControlItem } from "./background-task-controls.js";

export function mergeKayingCodeBackgroundTaskControlItems(
  current: readonly KayingCodeBackgroundTaskControlItem[],
  updates: readonly KayingCodeBackgroundTaskControlItem[],
): KayingCodeBackgroundTaskControlItem[] {
  const jobsById = new Map(current.map((job) => [job.jobId, job] as const));
  for (const job of updates) {
    jobsById.set(job.jobId, job);
  }
  return Array.from(jobsById.values());
}
