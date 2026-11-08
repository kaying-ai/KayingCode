// 本文件由 scripts/generate-mobile-taro-icons.py 生成，请勿手改。
// 码点取自 Flutter SDK 的 material/icons.dart，与 Flutter 端的 Icons.<name> 逐字形一致。
// 修改图标清单请编辑同目录的 icon-set.json，然后重跑生成脚本。

export const ICON_FONT_FAMILY = "KayingCodeMaterialIcons";

/** Flutter `Icons.<name>` → Unicode 码点。 */
export const ICON_CODEPOINTS = {
  // 壳层底栏（Flutter root_shell.dart 的 NavigationBar）
  "smart_toy": 0xe5c5,
  "smart_toy_outlined": 0xf3a8,
  "forum": 0xe2c3,
  "forum_outlined": 0xf0b0,
  "person": 0xe491,
  "person_outline": 0xe497,
  // 导航、返回与展开（arrow_back 见 Flutter chat/composer.dart；keyboard_arrow_* 是 Flutter 各处展开折叠的通用指示）
  "arrow_back": 0xe092,
  "chevron_right": 0xe15f,
  "keyboard_arrow_down": 0xe353,
  "keyboard_arrow_up": 0xe356,
  "menu": 0xe3dc,
  "add": 0xe047,
  // Bot 列表与设备（Flutter bot_list_page.dart、device_management_page.dart）
  "tune_outlined": 0xf466,
  "edit_outlined": 0xf00d,
  "delete_outline": 0xe1bb,
  "link_outlined": 0xf169,
  "desktop_windows_outlined": 0xefb2,
  "devices_other": 0xe1cc,
  "settings_outlined": 0xf36e,
  "settings_backup_restore": 0xe582,
  "save_outlined": 0xf334,
  // 引导提示图标
  "info_outline": 0xe33d,
  // 设置首页分组行（Flutter settings_page.dart 的 ListTile leading）
  "palette_outlined": 0xf24f,
  "language_outlined": 0xf14f,
  "support_agent_outlined": 0xf403,
  "copy_outlined": 0xef7f,
  "devices_outlined": 0xefbb,
  "extension_outlined": 0xf03f,
  "schedule_outlined": 0xf339,
  "school_outlined": 0xf33c,
  // 会话入口与抽屉（Flutter session_drawer.dart）
  "add_comment_outlined": 0xee41,
  // 消息与工具状态（Flutter msg_widgets.dart 的工具状态表：pendingApproval→hourglass_top、success→check、error→error_outline、cancelled→block、其余→build_outlined）
  "check": 0xe156,
  "check_circle": 0xe159,
  "check_circle_outline": 0xe15a,
  "block": 0xe0e1,
  "error_outline": 0xe238,
  "build_outlined": 0xef06,
  "hourglass_top": 0xe327,
  "hourglass_bottom": 0xe323,
  "motion_photos_on": 0xe407,
  "radio_button_unchecked": 0xe504,
  "radio_button_checked": 0xe503,
  "play_circle_outline": 0xe4ce,
  // 消息、回合与时间线（Flutter msg_widgets.dart、chat/insights.dart；fork_right/restore 见 Flutter 会话时间线的分叉与检查点标记）
  "attach_file": 0xe0b1,
  "compress": 0xe184,
  "swap_horiz": 0xe625,
  "flag_outlined": 0xf07b,
  "fact_check_outlined": 0xf045,
  "refresh": 0xe514,
  "fork_right": 0xf050c,
  "restore": 0xe534,
  // 输入区与斜杠命令（Flutter chat/composer.dart 的 send 键、chat/sheets.dart 的命令图标三分支）
  "arrow_upward": 0xe0a0,
  "auto_awesome_outlined": 0xeea9,
  "bolt": 0xe0ee,
  "grid_view_rounded": 0xf7c4,
  "memory": 0xe3db,
  "psychology": 0xe4ef,
  "stop": 0xe606,
  "terminal": 0xf0589,
  "data_object_outlined": 0xf05e0,
} as const;

export type IconName = keyof typeof ICON_CODEPOINTS;

/** 图标名全集，供测试与兜底逻辑按集合校验。 */
export const ICON_NAMES = Object.keys(ICON_CODEPOINTS) as IconName[];

/** 取码点对应的字形字符串。用码点而非源码里的字面量，避免不可见字符被误编辑。 */
export function iconGlyph(name: IconName): string {
  return String.fromCodePoint(ICON_CODEPOINTS[name]);
}
