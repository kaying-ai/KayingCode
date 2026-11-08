/** monogram 字号基准（SVG user units）；CJK 全角略缩小避免贴边。 */
const MONOGRAM_VIEWBOX_SIZE = 32;
const MONOGRAM_FONT_SIZE_LATIN = 16;
const MONOGRAM_FONT_SIZE_CJK = 15;

/** 无图插件默认头像：黑白灰，不引入装饰色，与整体界面一致。 */
const MONOGRAM_COLOR_CLASS = "bg-surface text-foreground";

export interface PluginMonogram {
  glyph: string;
  colorClass: string;
}

/**
 * 取展示名或插件 id 的首个字母/汉字作为 monogram 字形。
 * 跳过前导符号，保证 `@plugin`、`_helper` 这类 id 也能得到可读字形。
 */
export function resolvePluginMonogramGlyph(source: string | undefined): string | undefined {
  const trimmed = source?.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/[\p{L}\p{N}]/u);
  if (!match) return undefined;
  return match[0].toLocaleUpperCase();
}

/** 无品牌图时的稳定默认头像：字形优先取展示名；颜色固定黑白灰。 */
export function resolvePluginMonogram(input: {
  pluginId?: string;
  label?: string;
}): PluginMonogram | undefined {
  const glyph =
    resolvePluginMonogramGlyph(input.label) ?? resolvePluginMonogramGlyph(input.pluginId);
  if (!glyph) return undefined;
  return {
    glyph,
    colorClass: MONOGRAM_COLOR_CLASS,
  };
}

export function getPluginMonogramFontSize(glyph: string): number {
  // 粗略按东亚宽字符缩小；拉丁/数字用默认字号。
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿]/u.test(glyph)
    ? MONOGRAM_FONT_SIZE_CJK
    : MONOGRAM_FONT_SIZE_LATIN;
}

export const PLUGIN_MONOGRAM_VIEWBOX_SIZE = MONOGRAM_VIEWBOX_SIZE;
