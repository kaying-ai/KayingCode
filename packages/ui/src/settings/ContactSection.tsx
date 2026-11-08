import { ExternalLink } from "lucide-react";
import { KAYINGCODE_VERSION, ZCODE_UPSTREAM_VERSION } from "@zcode/shared";
import supportQr from "@/assets/support-contact-qr.png";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

const KAYING_AI_WEBSITE = "https://kayingai.com";
const KAYING_AI_CONTACT_EMAIL = "service@kayingai.com";

function ContactInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-ui-sm">
      <span className="shrink-0 text-foreground-subtle">{label}</span>
      <span className="min-w-0 select-all break-all text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function ContactSection() {
  const platform = usePlatform();
  const { intl } = useKayingCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });

  return (
    <section
      aria-label={t("settings.contact.title")}
      className="grid max-w-3xl gap-4 md:grid-cols-2"
    >
      <div className="rounded-xl border border-card-border bg-card p-5">
        <h3 className="text-ui-base font-medium">{t("settings.contact.qrTitle")}</h3>
        <p className="mt-1 text-ui-sm text-foreground-subtle">{t("settings.contact.qrHint")}</p>
        <img
          src={supportQr}
          alt={t("settings.contact.qrAlt")}
          className="mt-4 aspect-square w-full max-w-56 rounded-lg bg-white"
        />
      </div>
      <div className="rounded-xl border border-card-border bg-card p-5">
        <h3 className="text-ui-base font-medium">{t("settings.contact.websiteTitle")}</h3>
        <p className="mt-1 text-ui-sm text-foreground-subtle">
          {t("settings.contact.websiteHint")}
        </p>
        <p className="mt-4 break-all text-ui-sm text-foreground-subtle">{KAYING_AI_WEBSITE}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => platform.openExternal(KAYING_AI_WEBSITE)}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {t("settings.contact.websiteAction")}
        </Button>
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <ContactInfoRow
            label={t("settings.contact.emailTitle")}
            value={KAYING_AI_CONTACT_EMAIL}
          />
          <ContactInfoRow
            label={t("settings.contact.kayingCodeVersion")}
            value={KAYINGCODE_VERSION}
          />
          <ContactInfoRow
            label={t("settings.contact.zcodeVersion")}
            value={ZCODE_UPSTREAM_VERSION}
          />
        </div>
      </div>
    </section>
  );
}
