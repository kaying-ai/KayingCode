import { LoaderCircle } from "lucide-react";
import type {
  ConnectionProfile,
  SourceServerConnectionStateSnapshot,
  SourceServerOperationLog,
  SourceServerRecord,
} from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { resolveRemoteOperationProgress } from "@/project-sidebar/remoteOperationProgress.js";
import type { RemoteConnectionProgress } from "@/remote-connection-flow/contract.js";

/**
 * 只有 Host 明确处于进行中的连接状态才生成进度；终态（online/failed）由状态标签负责，
 * 避免把上一次尝试的日志重新画成“正在连接”。
 */
export function buildRemoteConnectionProgress({
  profile,
  state,
  server,
  logs,
}: {
  profile: ConnectionProfile;
  state?: SourceServerConnectionStateSnapshot;
  server?: SourceServerRecord;
  logs: readonly SourceServerOperationLog[];
}): RemoteConnectionProgress | null {
  if (!state || (state.state !== "bootstrapping" && state.state !== "retrying")) return null;
  return {
    profileId: profile.profileId,
    ...(profile.sourceServerId ? { sourceServerId: profile.sourceServerId } : {}),
    name: server?.displayName ?? profile.displayName ?? profile.transport,
    logs,
    state: state.state,
  };
}

/** 设备卡内的最小化连接进度；复用侧栏同一套阶段投影，不新增连接状态。 */
export function RemoteConnectionMinimizedProgress({
  progress,
  className,
}: {
  progress: RemoteConnectionProgress;
  className?: string;
}) {
  const { intl } = useKayingCodeIntl();
  const operationProgress = resolveRemoteOperationProgress(progress.logs);
  const percent = operationProgress.percent;
  return (
    <div
      data-remote-connection-progress
      className={cn("min-w-0 px-4 py-2", className)}
    >
      <div className="flex min-w-0 items-center gap-2 text-ui-sm font-medium text-progress-surface-foreground">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {intl.formatMessage({ id: operationProgress.titleId })}
        </span>
        {percent !== undefined ? <span className="shrink-0 tabular-nums">{percent}%</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label={intl.formatMessage(
          { id: "remote.connectionProgressLabel" },
          { device: progress.name },
        )}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent === undefined
          ? { "aria-busy": true }
          : { "aria-valuenow": percent })}
        className="mt-2 h-1 overflow-hidden rounded-full bg-border"
      >
        <span
          className={cn(
            "block h-full rounded-full bg-progress-surface-foreground",
            percent === undefined && "w-1/2 animate-pulse",
          )}
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
