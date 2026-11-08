/// 后端类型枚举：区分 ZCode 和 Kaying-code 两种后端。
enum BackendType {
  /// ZCode 官方后端（zflow 原生协议）
  zcode,

  /// Kaying-code 后端（kaying-code relay 协议）
  kayingcode;

  String get displayName => switch (this) {
        BackendType.zcode => 'ZCode',
        BackendType.kayingcode => 'KayingCode',
      };

  /// 从字符串解析，默认 zcode。
  static BackendType fromString(String? value) {
    if (value == 'kayingcode') return BackendType.kayingcode;
    return BackendType.zcode;
  }
}
