import zh from "../../../src/i18n/locales/zh-CN.ts";
import en from "../../../src/i18n/locales/en-US.ts";
export const usePlatform = () => window.viewportTest.platform;
export const logger = { debug() {}, warn() {}, info() {}, error() {} };
export const useKayingCodeIntl = () => ({
  intl: {
    formatMessage: ({ id }, values = {}) => {
      const messages = window.viewportTest.locale === "en" ? en : zh;
      return (messages[id] || id).replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
    },
  },
});
