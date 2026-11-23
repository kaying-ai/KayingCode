import { Cloud, Gamepad2, Loader2, LogIn, Pin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { cn } from "@/components/lib/utils.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useTapMakerProjects } from "@/hooks/useTapMakerProjects.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { TapMakerOpenProjectTarget } from "@/game-features/tapMakerProjectAssociation.js";

export function TapMakerProjectsPage({
  isDesktop,
  onOpenProject,
}: {
  isDesktop: boolean;
  onOpenProject: (target: TapMakerOpenProjectTarget) => void;
}) {
  const { intl, locale } = useKayingCodeIntl();
  const platform = usePlatform();
  const { projects, loading, error, working, refresh, restore, openLocal, authorize } =
    useTapMakerProjects(onOpenProject);
  const t = (key: string) => intl.formatMessage({ id: `gameFeatures.${key}` });
  const openLocalFolder = async (path: string) => {
    try {
      const result = await platform.openInFileManager(path);
      if (!result.success) throw new Error(result.error ?? "open-in-file-manager-failed");
    } catch {
      toast(intl.formatMessage({ id: "appHeader.openInFileManagerFailed" }));
    }
  };
  return (
    <div
      className="@container h-full overflow-y-auto p-3 sm:p-4"
      data-testid="tapmaker-projects-page"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-ui-xl font-semibold">{t("myGamesTitle")}</h2>
            {!loading && !error ? (
              <span className="rounded-md bg-surface px-2 py-0.5 text-ui-xs text-foreground-subtle tabular-nums">
                {intl.formatMessage(
                  { id: "gameFeatures.projectsCount" },
                  { count: projects.length },
                )}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-ui-sm text-foreground-subtle">{t("projectsDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !!working}
            onClick={() => void refresh()}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </Button>
          <Button variant="outline" size="sm" disabled={!!working} onClick={() => void authorize()}>
            {working === "authorize" ? <Loader2 className="animate-spin" /> : <LogIn />}
            {t("authorize")}
          </Button>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-border bg-surface p-4 text-ui-base"
        >
          <p className="font-medium">{t("operationFailed")}</p>
          <p className="mt-1 break-words text-ui-sm text-foreground-subtle">{error}</p>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {t("loading")}
        </p>
      ) : projects.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Gamepad2 className="size-8 text-foreground-subtle" />
          <p>{t("empty")}</p>
          <p className="text-ui-sm text-foreground-subtle">{t("emptyDescription")}</p>
        </div>
      ) : null}
      {!loading ? (
        <div className="mx-auto grid max-w-5xl gap-4 @xl:grid-cols-2 @xl:px-8 @min-[54rem]:grid-cols-3">
          {projects.map((project) => {
            const metadata = [project.gameType, project.stage].filter(Boolean).join(" · ");
            const localDirectory = project.localDirectory;
            const isLocal = Boolean(localDirectory);
            const location = localDirectory ?? t("remoteOnly");
            return (
              <article
                key={project.id}
                className={cn(
                  "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-colors",
                  isLocal ? "border-card-border" : "border-dashed border-border",
                )}
                data-testid="tapmaker-project-card"
                data-state={isLocal ? "local" : "remote"}
              >
                {isLocal ? (
                  <span className="pointer-events-none absolute top-4 -right-4 w-20 rotate-45 bg-success/15 py-0.5 text-center text-ui-xs font-medium whitespace-nowrap text-success">
                    {t("localState")}
                  </span>
                ) : null}
                <div className={cn("flex min-w-0 items-start gap-2.5", isLocal && "pr-14")}>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface",
                      isLocal ? "text-foreground" : "text-foreground-subtle",
                    )}
                    aria-hidden="true"
                  >
                    <Gamepad2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 self-center">
                    <div className="flex items-center gap-2">
                      <h3
                        className="min-w-0 flex-1 truncate text-ui-base leading-tight font-semibold"
                        title={project.name}
                      >
                        {project.name}
                      </h3>
                      {project.pinnedAt ? (
                        <Pin
                          className="size-3.5 shrink-0 text-foreground-subtle"
                          aria-label={t("pinned")}
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-ui-xs leading-tight text-foreground-subtle empty:hidden">
                      {metadata ? (
                        <span className="truncate" title={metadata}>
                          {metadata}
                        </span>
                      ) : null}
                      {/* 云端状态保留轻量标识；本地状态由右上角横幅表达，避免重复。 */}
                      {!isLocal ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-foreground-subtlest">
                          <span
                            aria-hidden="true"
                            className="size-1 rounded-full border border-foreground-subtlest"
                          />
                          {t("cloudState")}
                        </span>
                      ) : null}
                      <ProjectActivityDate
                        value={
                          project.lastConversationAt ?? project.lastAccessedAt ?? project.createdAt
                        }
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "mt-auto flex min-w-0 items-center gap-2 border-t border-card-border pt-3",
                    isLocal ? "flex-wrap justify-end" : "justify-between",
                  )}
                >
                  {isLocal && localDirectory ? (
                    <>
                      <Button
                        variant="outline"
                        size="lg"
                        className="text-ui-sm whitespace-nowrap"
                        disabled={!isDesktop}
                        onClick={() => void openLocalFolder(localDirectory)}
                      >
                        {t("openFolder")}
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="text-ui-sm whitespace-nowrap"
                        disabled={!!working}
                        onClick={() => void openLocal(project)}
                      >
                        {t("openInAgent")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="flex min-w-0 items-center gap-1.5 text-ui-sm text-foreground-subtlest">
                        <Cloud className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate" title={location}>
                          {location}
                        </span>
                      </p>
                      <Button
                        variant="outline"
                        size="lg"
                        className="text-ui-sm"
                        disabled={!!working || !isDesktop}
                        onClick={() => void restore(project)}
                      >
                        {working === project.id ? <Loader2 className="animate-spin" /> : null}
                        {t("restore")}
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!isDesktop ? (
        <p className="mt-4 text-ui-sm text-foreground-subtle">{t("desktopRestore")}</p>
      ) : null}
    </div>
  );
}

function ProjectActivityDate({ value, locale }: { value: string | null; locale: string }) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return (
    <time className="ml-auto shrink-0 tabular-nums" dateTime={value}>
      {new Date(value).toLocaleDateString(locale)}
    </time>
  );
}
