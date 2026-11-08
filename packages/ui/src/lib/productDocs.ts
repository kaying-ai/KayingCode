// 产品文档入口统一收口，避免不同菜单跳到不一致的文档站。
/** KayingCode.localrun：无官方文档站。 */
export function hasProductDocsUrl(): boolean {
  return KAYINGCODE_PRODUCT_DOCS_URL.trim().length > 0;
}

export const KAYINGCODE_PRODUCT_DOCS_URL = "";
