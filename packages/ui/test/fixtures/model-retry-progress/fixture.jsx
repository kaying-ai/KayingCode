import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ConversationTurnLoading } from "@/v4/ConversationTurnLoading.js";
import "./styles.css";

function Fixture() {
  const [apiRetry, setApiRetry] = useState(null);
  const [eligible, setEligible] = useState(true);
  const [initialElapsedMs, setInitialElapsedMs] = useState(0);
  const [locale, setLocale] = useState("zh-CN");
  const retry = (seconds, attempt = 1) => {
    setEligible(true);
    setApiRetry({
      attempt,
      maxAttempts: 11,
      nextRetryAt: Date.now() + seconds * 1000,
      reasonCode: "fault.provider.http502",
    });
  };
  // 模拟切回运行中的历史轮：以本轮已运行时长挂载普通 loading。
  const resume = (elapsedMs) => {
    setApiRetry(null);
    setEligible(true);
    setInitialElapsedMs(elapsedMs);
  };
  return (
    <KayingCodeIntlProvider key={locale} initialLocale={locale}>
      <div className="mb-4 flex flex-wrap gap-3 text-ui-base">
        <button onClick={() => retry(60)}>Retry 60</button>
        <button onClick={() => retry(15)}>Replay 15</button>
        <button onClick={() => retry(-1, 3)}>Expired 3</button>
        <button onClick={() => setApiRetry(null)}>Recovered</button>
        <button onClick={() => setEligible(false)}>End</button>
        <button onClick={() => resume(12500)}>Resume 12.5</button>
        <button onClick={() => setLocale("en-US")}>English</button>
      </div>
      <div data-testid="loading-area">
        <ConversationTurnLoading
          apiRetry={apiRetry}
          eligible={eligible}
          initialElapsedMs={initialElapsedMs}
        />
      </div>
    </KayingCodeIntlProvider>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
