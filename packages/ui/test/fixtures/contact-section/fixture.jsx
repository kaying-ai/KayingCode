import { createRoot } from "react-dom/client";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ContactSection } from "@/settings/ContactSection.js";
import "./styles.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "zh-CN";
document.documentElement.className = params.get("theme") ?? "theme-zai-dark";

createRoot(document.getElementById("root")).render(
  <KayingCodeIntlProvider initialLocale={locale}>
    <PlatformProvider
      platform={{
        openExternal: async (url) => {
          window.__openedExternal = url;
        },
      }}
    >
      <main className="mx-auto max-w-3xl px-5 py-8">
        <ContactSection />
      </main>
    </PlatformProvider>
  </KayingCodeIntlProvider>,
);
