import zh from "@/i18n/locales/zh-CN.js";
import en from "@/i18n/locales/en-US.js";
export function useKayingCodeIntl() {
  const locale = new URLSearchParams(location.search).get("lang") === "en" ? en : zh;
  return {
    intl: {
      formatMessage: ({ id }, values = {}) =>
        Object.entries(values).reduce(
          (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
          locale[id] ?? id,
        ),
    },
  };
}
export function ControlHintTooltip({ children }) {
  return children;
}
export function useShortcutCommandLabel() {
  return "";
}
export function useEffectiveShortcutBindings() {
  return {};
}
