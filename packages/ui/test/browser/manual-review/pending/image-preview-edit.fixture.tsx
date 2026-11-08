import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ImagePreviewDialog } from "@/components/ai-elements/image-preview-dialog.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { registerImageComposerTarget } from "@/image-preview-editor/index.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { useComposerAttachments } from "@/v4/composer/useComposerAttachments.js";
import { useComposerAttachmentUploadStore } from "@/store/composerAttachmentUploadStore.js";
import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";
import "@/styles.css";
const params = new URLSearchParams(location.search);
const locale = params.get("locale") === "en-US" ? "en-US" : "zh-CN";
localStorage.setItem("kayingcode-locale-preference", locale);
document.documentElement.className =
  params.get("theme") === "light" ? "theme-zai-light" : "theme-zai-dark dark";
const src =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="white"/><circle cx="600" cy="400" r="150" fill="skyblue"/></svg>',
  );
const fixture = window as unknown as {
  savedFiles: File[];
  changeScope: () => void;
  rejectSave: boolean;
  queuedAttachments: () => Array<{ name: string; status: string }>;
};
fixture.savedFiles = [];
fixture.rejectSave = false;
fixture.queuedAttachments = () =>
  Object.values(useComposerAttachmentUploadStore.getState().scopes)
    .flat()
    .map((entry) => ({ name: entry.filename, status: entry.uploadStatus }));
const services = { promptAttachmentTransferService: {} } as unknown as IServiceAccessor;
const platform = { canSelectFilePath: false } as IPlatformService;
function ComposerProbe({ scope }: { scope: number }) {
  const { attachments } = useComposerAttachments({
    workspacePath: "/image-fixture",
    scopeId: `draft-${scope}`,
    attachmentPut: async () => {
      throw new Error("Fixture must not upload or send messages");
    },
  });
  return <output data-image-composer-scope={scope}>{attachments.length}</output>;
}
function Fixture() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(0);
  fixture.changeScope = () => setScope((value) => value + 1);
  useEffect(() => {
    if (params.has("composer")) return;
    return registerImageComposerTarget({
      append: (file) => {
        if (fixture.rejectSave) return false;
        fixture.savedFiles.push(file);
        return true;
      },
    });
  }, [scope]);
  return (
    <KayingCodeIntlProvider initialLocale={locale}>
      {params.has("composer") && (
        <ServiceProvider services={services}>
          <PlatformProvider platform={platform}>
            <ComposerProbe scope={scope} />
          </PlatformProvider>
        </ServiceProvider>
      )}
      <button onClick={() => setOpen(true)}>Open</button>
      <ImagePreviewDialog
        open={open}
        onOpenChange={setOpen}
        initialIndex={0}
        items={
          params.has("multi")
            ? [
                { alt: "drawing.svg", src },
                { alt: "second.svg", src: src + "%20" },
              ]
            : [{ alt: "drawing.svg", src }]
        }
      />
    </KayingCodeIntlProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
