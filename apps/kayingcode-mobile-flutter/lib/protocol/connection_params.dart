import 'backend/backend_type.dart';

/// 当前自托管 Web V2 授权链接和上游 ZCode V2 链接的唯一解析入口。
/// 只接受 HTTPS/WSS；旧配对码、fragment v1 与 hash/t 鉴权不再支持。
class ZflowConnectionParams {
  static const _knownHostDomains = [
    'z.ai',
    'bigmodel.cn',
    'kayingai.com',
    'kaying.ai',
    'kaying.video',
  ];

  final String deviceSid;
  final String? deviceMid;
  final String? deviceName;
  final String? appVersion;
  final String? theme;
  final Uri source;
  final BackendType backendType;
  bool get isV2 => true;
  final bool isKayingcodeWebV2;

  /// 原始 V2 URL，WebView 保留其编码、查询与一次性授权 fragment。
  final String raw;

  const ZflowConnectionParams({
    required this.deviceSid,
    required this.source,
    this.deviceMid,
    this.deviceName,
    this.appVersion,
    this.theme,
    this.backendType = BackendType.zcode,
    this.isKayingcodeWebV2 = false,
    this.raw = '',
  });

  static String? _get(Uri uri, String key) {
    final v = uri.queryParameters[key]?.trim();
    return v == null || v.isEmpty ? null : v;
  }

  static ZflowConnectionParams? parse(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;

    // 修复依据：自托管链接由 Web 消费一次性邀请，不能降级到已退役的配对协议。
    final web = Uri.tryParse(trimmed);
    if (web != null && web.fragment.startsWith('authorize=')) {
      try {
        final invitation = Uri.splitQueryString(web.fragment)['authorize'];
        final params = _parseZcodeUrl(trimmed);
        if (web.scheme != 'https' ||
            web.path != '/remote/v4' ||
            web.userInfo.isNotEmpty ||
            params == null ||
            !params.isV2 ||
            !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(invitation ?? '')) {
          return null;
        }
        // 账号邀请由官方 Web 单次消费；容器不能重建旧配对串。
        return ZflowConnectionParams(
          deviceSid: params.deviceSid,
          source: web,
          deviceMid: params.deviceMid,
          deviceName: params.deviceName,
          appVersion: params.appVersion,
          backendType: BackendType.kayingcode,
          isKayingcodeWebV2: true,
          raw: trimmed,
        );
      } on FormatException {
        return null;
      }
    }
    if (web?.hasFragment == true) return null;
    return _parseZcodeUrl(trimmed);
  }

  /// 解析 ZCode URL
  static ZflowConnectionParams? _parseZcodeUrl(String raw) {
    Uri uri;
    try {
      uri = Uri.parse(raw.trim());
    } catch (_) {
      return null;
    }
    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'https' && scheme != 'wss') return null;
    final sid = _get(uri, 'sid');
    // 旧 hash/t 鉴权已退役，不能将旧链接静默解释为 V2。
    if (sid == null ||
        uri.userInfo.isNotEmpty ||
        uri.queryParameters.containsKey('hash') ||
        uri.queryParameters.containsKey('t')) {
      return null;
    }
    return ZflowConnectionParams(
      deviceSid: sid,
      deviceMid: _get(uri, 'mid'),
      deviceName: _get(uri, 'name'),
      appVersion: _get(uri, 'app_version'),
      theme: _get(uri, 'theme'),
      source: uri,
      backendType: BackendType.zcode,
      raw: raw,
    );
  }

  /// 当前账户 V2 通道；每次连接使用新的 terminal token。
  Uri get relayWsUri {
    final base = Uri(
      scheme: 'wss',
      host: source.host,
      port: source.hasPort ? source.port : null,
      path: '/api/v1/remote/ws2',
    );
    if (deviceMid == null) return base;
    return base.replace(queryParameters: {'mid': deviceMid});
  }

  /// 已知服务器只跳过额外提醒，不改变连接串格式与传输层校验。
  /// 旧判断只认 zcode.z.ai，KayingCode 等已知通道会被误报；按完整域名边界匹配。
  bool get isKnownHost {
    final host = source.host.toLowerCase().replaceFirst(RegExp(r'\.$'), '');
    return _knownHostDomains.any(
      (domain) => host == domain || host.endsWith('.$domain'),
    );
  }
}
