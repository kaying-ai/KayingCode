import { Cloud, Folder, Gamepad2, Loader2, LogIn, Pin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useTapMakerProjects } from "@/hooks/useTapMakerProjects.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

export function TapMakerProjectsPage({
  isDesktop,
  onOpenProject,
}: {
  isDesktop: boolean;
  onOpenProject: (path: string) => void;
}) {
  const { intl, locale } = useKayingCodeIntl();
  const { projects, loading, error, working, refresh, restore, openLocal, authorize } =
    useTapMakerProjects(onOpenProject);
  const t = (key: string) => intl.formatMessage({ id: `gameFeatures.${key}` });
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
            const location = project.localDirectory ?? t("remoteOnly");
            const LocationIcon = project.localDirectory ? Folder : Cloud;
            return (
              <article
                key={project.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-card-border bg-card p-4"
                data-testid="tapmaker-project-card"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground-subtle"
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
                      <ProjectActivityDate
                        value={
                          project.lastConversationAt ?? project.lastAccessedAt ?? project.createdAt
                        }
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-card-border pt-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-ui-sm text-foreground-subtle">
                    <LocationIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate" title={location}>
                      {location}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="text-ui-sm"
                    disabled={!!working || (!project.localDirectory && !isDesktop)}
                    onClick={() =>
                      project.localDirectory ? openLocal(project) : void restore(project)
                    }
                  >
                    {working === project.id ? <Loader2 className="animate-spin" /> : null}
                    {t(project.localDirectory ? "openLocal" : "restore")}
                  </Button>
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
