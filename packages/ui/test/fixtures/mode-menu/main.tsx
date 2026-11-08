import { useState } from "react";
import { createRoot } from "react-dom/client";
import { V4ComposerModeSwitch } from "@/v4/composer/V4ComposerModeControls.js";
import "@/styles.css";
function Fixture() {
  const [draftConfig, setConfig] = useState({ mode: "build", planEnabled: false });
  const [activeConfigPicker, setPicker] = useState(null);
  return (
    <main className="flex h-screen items-end bg-background p-8 text-foreground">
      <V4ComposerModeSwitch
        provider="glm"
        workspacePath="/fixture"
        draftConfig={draftConfig}
        activeConfigPicker={activeConfigPicker}
        onConfigPickerOpenChange={(_, open) => setPicker(open ? "mode" : null)}
        onSwitchMode={(mode) =>
          setConfig((current) =>
            mode === "plan" || mode === "plan-off"
              ? { ...current, planEnabled: mode === "plan" }
              : { ...current, mode },
          )
        }
      />
      <output data-testid="mode-state">{JSON.stringify(draftConfig)}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
