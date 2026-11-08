import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { V4ComposerModelControls } from "@/v4/composer/V4ComposerToolbar.js";
import { createComposerSubmissionConfig } from "@/v4/composer/composerSubmissionConfig.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import "./styles.css";
const view = {
  revision: 1,
  providers: [
    {
      providerId: "fixture-api",
      providerName: "Personal",
      config: { api: { type: "openai" }, access: { kind: "api-key" } },
      models: ["first", "second"].map((modelId) => ({
        modelId,
        config: {
          optionSpecs: {
            reasoningLevel: {
              values: modelId === "first" ? ["low", "high"] : ["low", "high", "xhigh"],
            },
          },
        },
      })),
    },
  ],
};
function Fixture() {
  const [draft, setDraft] = useState({
    modelSelection: {
      providerId: "fixture-api",
      modelId: "first",
      options: { reasoningLevel: "high" },
    },
    mode: "build",
  });
  const [picker, setPicker] = useState(null);
  const [status, setStatus] = useState("ready");
  const [submitted, setSubmitted] = useState(null);
  window.integration = {
    calls: window.integration?.calls ?? [],
    loading: () => setStatus("loading"),
    error: () => setStatus("error"),
    ready: () => setStatus("ready"),
  };
  return (
    <KayingCodeIntlProvider initialLocale="en-US">
      <TooltipProvider>
        <main className="min-h-dvh bg-background p-4 text-foreground">
          <div className="@container/composer mx-auto mt-32 max-w-xl">
            <textarea data-testid="v4-composer-input" className="w-full border" />
            <div className="group/toolbar flex justify-end">
              <V4ComposerModelControls
                workspacePath="/fixture"
                workspaceIdentity="fixture-workspace"
                modelSelectionView={view}
                modelSelectionState={{ status }}
                modelSelectionReload={() => setStatus("ready")}
                sessionId={null}
                phase={null}
                draftMode
                draftConfig={draft}
                usage={null}
                disabled={false}
                activeConfigPicker={picker}
                onConfigPickerOpenChange={(key, open) => setPicker(open ? key : null)}
                onSelectModel={(provider, model, source) => {
                  window.integration.calls.push({ kind: "model", provider, model, source });
                  setDraft((current) => ({
                    ...current,
                    modelSelection: { providerId: provider, modelId: model, options: {} },
                  }));
                }}
                onSelectThought={(thought, target) => {
                  window.integration.calls.push({ kind: "thought", thought, target });
                  setDraft((current) => ({
                    ...current,
                    modelSelection: {
                      ...current.modelSelection,
                      options: { reasoningLevel: thought },
                    },
                  }));
                }}
                onSwitchMode={() => {}}
              />
            </div>
          </div>
          <button
            data-testid="submit"
            className="mt-12"
            onClick={() => setSubmitted(createComposerSubmissionConfig(draft, view))}
          >
            Submit
          </button>
          <output data-testid="submission">{JSON.stringify(submitted)}</output>
        </main>
      </TooltipProvider>
    </KayingCodeIntlProvider>
  );
}
createRoot(document.getElementById("root")).render(<Fixture />);
