import { TID_CHAT_LOADING } from "@zcode/shared";
import type { ApiRetryState } from "@zcode/shared/kayingcode-protocol-v4";
import { ChatApiRetryStatus } from "@/chat-input-toolbar/display.js";
import { ChatLoading } from "@/components/ai-elements/chat-loading.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

export function ConversationTurnLoading({
  apiRetry,
  eligible,
}: {
  apiRetry: ApiRetryState | null;
  eligible: boolean;
}) {
  const { intl, locale } = useKayingCodeIntl();
  if (!apiRetry && !eligible) return null;
  const attempt = apiRetry ? Math.max(1, Math.floor(apiRetry.attempt)) : 0;
  return (
    <div data-kayingcode-chat-loading-slot="true" className="min-h-5">
      {apiRetry ? (
        <ChatApiRetryStatus
          apiRetry={{
            kind: "api_retry",
            attempt,
            // maxAttempts 包含首次请求，用户看到的上限只计重试。
            maxRetries: Math.max(Math.floor(apiRetry.maxAttempts) - 1, attempt),
            retryDelayMs: 0,
            errorStatus: null,
            error: apiRetry.reasonCode,
          }}
          nextRetryAt={apiRetry.nextRetryAt}
          intl={intl}
          locale={locale}
        />
      ) : (
        <ChatLoading loading data-testid={TID_CHAT_LOADING} size="sm" />
      )}
    </div>
  );
}
