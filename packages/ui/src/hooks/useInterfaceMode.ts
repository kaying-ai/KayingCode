import { useKayingCodeStoreWithDefault } from "@/store/StoreProvider.js";

export function useIsOfficeMode(): boolean {
  return useKayingCodeStoreWithDefault((state) => state.interfaceMode === "office", false);
}
