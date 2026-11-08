import {
  collectVisibleKayingCodeBackgroundTaskControlItems,
  getKayingCodeBackgroundTaskControlItemElapsedMs,
  isActiveKayingCodeBackgroundTaskControlItem,
  parseKayingCodeBackgroundTaskControlItems,
  type KayingCodeBackgroundTaskControlItem,
  type KayingCodeBackgroundTaskControlStatus,
} from "./background-task-controls.js";

export type KayingCodeBackgroundBashJobStatus = KayingCodeBackgroundTaskControlStatus;
export type KayingCodeBackgroundBashJob = KayingCodeBackgroundTaskControlItem & {
  taskKind: "bash";
};

export function parseKayingCodeBackgroundBashJobs(value: unknown): KayingCodeBackgroundBashJob[] {
  return parseKayingCodeBackgroundTaskControlItems(value).filter(isBackgroundBashJob);
}

export function isActiveKayingCodeBackgroundBashJob(job: KayingCodeBackgroundBashJob): boolean {
  return isActiveKayingCodeBackgroundTaskControlItem(job);
}

export function getKayingCodeBackgroundBashJobElapsedMs(
  job: KayingCodeBackgroundBashJob,
  now = Date.now(),
): number {
  return getKayingCodeBackgroundTaskControlItemElapsedMs(job, now);
}

export function collectVisibleKayingCodeBackgroundBashJobs(
  jobs: readonly KayingCodeBackgroundBashJob[],
  now = Date.now(),
  thresholdMs = 30_000,
): Array<KayingCodeBackgroundBashJob & { elapsedMs: number }> {
  return collectVisibleKayingCodeBackgroundTaskControlItems(jobs, now, thresholdMs) as Array<
    KayingCodeBackgroundBashJob & { elapsedMs: number }
  >;
}

function isBackgroundBashJob(job: KayingCodeBackgroundTaskControlItem): job is KayingCodeBackgroundBashJob {
  return job.taskKind === "bash";
}
