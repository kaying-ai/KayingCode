export const useToolbarConfigOptions = () => ({ error: null });
export const useProviderSettingsView = () => ({
  state: { status: "ready", view: { providers: [] } },
});
export const useSettings = () => ({ settings: {} });
const store = { openSettingsTab() {} };
export const useTabStore = (select) => select(store);
export const useShortcutCommandLabel = () => "";
export const useToolbarShortcutBindings = () => {};
export const V4ComposerModeSwitch = () => null;
