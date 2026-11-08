import { ArrowRightIcon, CopyIcon, ExternalLinkIcon, RotateCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { toast } from "@/components/ui/toast.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { cn } from "@/components/lib/utils.js";

function normalizeEditableUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * 转写对比单侧地址栏：显示当前地址，支持改址跳转、刷新、复制、系统浏览器打开。
 * 不引入第二套地址栏事实源以外的业务状态；导航仍走 UnifiedBrowserView 的 navigationRequest。
 */
export function CompareBrowserUrlBar({
  currentUrl,
  isNavigating,
  label,
  navigateNonce,
  onNavigate,
  onReload,
}: {
  currentUrl: string;
  isNavigating: boolean;
  label: string;
  navigateNonce: number;
  onNavigate: (url: string) => void;
  onReload: () => void;
}): React.JSX.Element {
  const { intl } = useKayingCodeIntl();
  const platform = usePlatform();
  const [draft, setDraft] = useState(currentUrl);

  useEffect(() => {
    setDraft(currentUrl);
  }, [currentUrl, navigateNonce]);

  const commitNavigate = useCallback(() => {
    const next = normalizeEditableUrl(draft);
    if (!next) {
      toast(intl.formatMessage({ id: "pluginBrowserCompare.urlInvalid" }));
      return;
    }
    onNavigate(next);
  }, [draft, intl, onNavigate]);

  const handleCopy = useCallback(() => {
    const value = currentUrl || draft;
    if (!value) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast(intl.formatMessage({ id: "pluginBrowserCompare.urlCopyFailed" }));
      return;
    }
    void navigator.clipboard.writeText(value).then(
      () => toast(intl.formatMessage({ id: "pluginBrowserCompare.urlCopySuccess" })),
      () => toast(intl.formatMessage({ id: "pluginBrowserCompare.urlCopyFailed" })),
    );
  }, [currentUrl, draft, intl]);

  const handleOpenExternal = useCallback(() => {
    const next = normalizeEditableUrl(currentUrl || draft);
    if (!next) {
      toast(intl.formatMessage({ id: "pluginBrowserCompare.urlInvalid" }));
      return;
    }
    platform.openExternal(next);
  }, [currentUrl, draft, intl, platform]);

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border px-1.5">
      <span className="w-16 shrink-0 truncate text-ui-xs font-medium text-foreground">{label}</span>
      <Input
        value={draft}
        size="xs"
        spellCheck={false}
        autoComplete="off"
        aria-label={label}
        placeholder={intl.formatMessage({ id: "pluginBrowserCompare.urlPlaceholder" })}
        className="h-5 flex-1 text-ui-xs"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitNavigate();
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={isNavigating}
        aria-label={intl.formatMessage({ id: "pluginBrowserCompare.urlGo" })}
        title={intl.formatMessage({ id: "pluginBrowserCompare.urlGo" })}
        onClick={commitNavigate}
      >
        <ArrowRightIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={isNavigating}
        aria-label={intl.formatMessage({ id: "pluginBrowserCompare.urlRefresh" })}
        title={intl.formatMessage({ id: "pluginBrowserCompare.urlRefresh" })}
        onClick={onReload}
      >
        <RotateCwIcon className={cn("size-3.5", isNavigating && "animate-spin")} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={intl.formatMessage({ id: "pluginBrowserCompare.urlCopy" })}
        title={intl.formatMessage({ id: "pluginBrowserCompare.urlCopy" })}
        onClick={handleCopy}
      >
        <CopyIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={intl.formatMessage({ id: "pluginBrowserCompare.urlOpenExternal" })}
        title={intl.formatMessage({ id: "pluginBrowserCompare.urlOpenExternal" })}
        onClick={handleOpenExternal}
      >
        <ExternalLinkIcon className="size-3.5" />
      </Button>
    </div>
  );
}
