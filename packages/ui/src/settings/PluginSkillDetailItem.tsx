import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { PluginComponentDisplayItem } from "@/settings/PluginComponentGroups.js";

export function PluginSkillDetailItem({ item }: { item: PluginComponentDisplayItem }) {
  const { intl } = useKayingCodeIntl();
  return (
    <div className="min-w-0 flex-1" data-testid="plugin-skill-detail" data-skill-name={item.name}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="break-words text-ui-base font-medium text-foreground">
          {item.displayName ?? item.name}
        </span>
        {item.displayName ? (
          <span className="break-all font-mono text-ui-sm text-foreground-subtle">{item.name}</span>
        ) : null}
      </div>
      {item.description ? (
        <p className="mt-1 whitespace-pre-line break-words text-ui-base text-foreground-subtle">
          {item.description}
        </p>
      ) : null}
      {item.subskills?.length ? (
        <div className="mt-3">
          <p className="mb-2 text-ui-sm text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.plugins.detail.subskills" },
              { count: item.subskills.length },
            )}
          </p>
          <ul className="space-y-3 border-l border-border pl-3">
            {item.subskills.map((child) => (
              <li
                key={child.id}
                data-testid="plugin-subskill"
                data-subskill-id={child.id}
                className="min-w-0"
              >
                <h3 className="break-words text-ui-base font-medium text-foreground">
                  {child.displayName}
                </h3>
                <p className="mt-0.5 break-words text-ui-sm text-foreground-subtle">
                  {child.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
