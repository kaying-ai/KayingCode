import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import enUS from "@/i18n/locales/en-US.js";
import { isSettingsSectionAvailable } from "@/settings/settingsPageConfig.js";
import type { SettingsSearchResult } from "@/settings-search/contract.js";
import type { SettingsSearchAvailability } from "@/settings-search/settingsSearchIndex.js";
import {
  buildSettingsSearchEntries,
  filterSettingsSearchEntries,
  type SettingsSearchSection,
} from "@/settings-search/settingsSearchResults.js";

export function SettingsSearch({
  sections,
  availability,
  onSelect,
}: {
  sections: readonly SettingsSearchSection[];
  availability: SettingsSearchAvailability;
  onSelect: (result: SettingsSearchResult) => void;
}) {
  const { intl } = useKayingCodeIntl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedRef = useRef<SettingsSearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = intl.formatMessage({ id: "settings.search.title" });
  const entries = useMemo(
    () =>
      buildSettingsSearchEntries({
        sections,
        translate: (id) => intl.formatMessage({ id }),
        fallbackTranslate: (id) => enUS[id],
        availability,
        isSectionAvailable: (section) => isSettingsSectionAvailable(section, availability.desktop),
      }),
    [sections, intl, availability],
  );
  const results = useMemo(() => filterSettingsSearchEntries(entries, query), [entries, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          selectedRef.current = null;
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-label={title}
          data-testid="settings-search-open"
          className="w-full justify-start gap-2 rounded-xl px-1.5 text-foreground-subtle max-lg:mx-auto max-lg:size-10 max-lg:justify-center max-lg:px-0"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate max-lg:sr-only">{title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        data-testid="settings-search-dialog"
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          const selected = selectedRef.current;
          if (selected) {
            // 先结束 Dialog 的焦点锁，再导航，让设置行 / 分区拥有最后一次聚焦权。
            if (selected.setting) event.preventDefault();
            selectedRef.current = null;
            onSelect(selected);
          }
        }}
        onEscapeKeyDown={(event) => {
          // 中文输入法组字中的 Esc 只用于取消候选词，不关闭弹窗。
          if (event.isComposing || event.keyCode === 229) {
            event.preventDefault();
            return;
          }
          if (query) {
            event.preventDefault();
            setQuery("");
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "settings.search.description" })}
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} label={title} className="rounded-xl p-2">
          <div className="relative">
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              aria-label={title}
              placeholder={title}
              data-testid="settings-search-input"
              className="pr-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={intl.formatMessage({ id: "settings.search.clear" })}
                data-testid="settings-search-clear"
                className="absolute right-2 top-2"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
          <CommandList
            className="max-h-[55vh]"
            aria-label={intl.formatMessage({ id: "settings.search.results" })}
          >
            {results.length === 0 ? (
              <p
                role="status"
                data-testid="settings-search-empty"
                className="px-4 py-8 text-center text-ui-base text-foreground-subtle"
              >
                {intl.formatMessage({ id: "settings.search.empty" })}
              </p>
            ) : (
              results.map((entry) => (
                <CommandItem
                  key={entry.setting ?? entry.section}
                  value={entry.setting ?? entry.section}
                  data-settings-search-result={entry.setting ?? entry.section}
                  className="items-start rounded-md py-2"
                  onSelect={() => {
                    selectedRef.current = entry;
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-ui-base">{entry.label}</span>
                    <span className="block text-ui-sm text-foreground-subtle">
                      {entry.setting
                        ? entry.sectionLabel
                        : intl.formatMessage({ id: "settings.search.section" })}
                    </span>
                  </span>
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
