import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ModelConfigSelect } from "@/ModelConfigSelect.js";
import "./styles.css";
const groups = [
  {
    key: "provider-a",
    label: "KayingCode Built-in",
    labelBadge: "Built-in",
    items: [
      { key: "model-a", value: "a/first", name: "First model" },
      { key: "model-b", value: "a/second", name: "Second model" },
    ],
  },
  {
    key: "provider-b",
    label: "Personal",
    labelBadge: "API",
    items: [{ key: "model-c", value: "b/custom", name: "Custom model" }],
  },
];
function Fixture() {
  const [model, setModel] = useState("a/first");
  const [thought, setThought] = useState("high");
  const [disabled, setDisabled] = useState(false);
  const [fixed, setFixed] = useState(false);
  const ref = useRef(null);
  const calls = useRef([]);
  window.fixture = {
    calls: calls.current,
    missing: () => setThought(""),
    fixed: () => setFixed(true),
    disable: () => setDisabled(true),
    enable: () => setDisabled(false),
  };
  const options = useMemo(
    () => ({
      providerLabel: "Provider",
      modelsLabel: "Models",
      effortLabel: "Effort",
      selectModelLabel: "Choose model",
      levels: fixed
        ? [{ value: "high", label: "High" }]
        : [
            { value: "low", label: "Low" },
            { value: "high", label: "High" },
            { value: "xhigh", label: "Highest" },
          ],
      value: thought,
      onValueChange: (value) => {
        calls.current.push({ kind: "thought", model, value });
        setThought(value);
      },
    }),
    [model, thought, fixed],
  );
  return (
    <KayingCodeIntlProvider initialLocale="en-US">
      <main className="min-h-dvh bg-background p-4 text-foreground">
        <div className="@container/composer mx-auto mt-32 max-w-xl">
          <textarea data-testid="v4-composer-input" className="h-24 w-full border" />
          <div className="group/toolbar mt-3 flex justify-end">
            <ModelConfigSelect
              modelGroups={groups}
              normalizedValue={model}
              triggerLabel={
                groups.flatMap((g) => g.items).find((i) => i.value === model)?.name ||
                "Choose model"
              }
              composerOptions={options}
              showManageModelsAction={true}
              manageModelsLabel="Manage models"
              onManageModels={() => calls.current.push({ kind: "manage" })}
              lockReasonMessage="Locked"
              isItemLocked={() => false}
              onValueChange={(value) => {
                calls.current.push({ kind: "model", value });
                setModel(value);
                setThought("");
              }}
              disabled={disabled}
              triggerRef={ref}
              focusSelectorOnClose='[data-testid="v4-composer-input"]'
              contentAlign="center"
            />
          </div>
        </div>
        <button data-testid="outside" className="mt-6">
          Outside
        </button>
        <output data-testid="selection">
          {model}:{thought}
        </output>
      </main>
    </KayingCodeIntlProvider>
  );
}
createRoot(document.getElementById("root")).render(<Fixture />);
