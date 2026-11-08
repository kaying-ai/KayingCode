import 'package:flutter/foundation.dart';

/// Device identity sent during relay auth and mobile-view-state updates.
///
/// The web client reports itself as a browser; Zflow identifies itself
/// honestly so the desktop can show the real connected client.
const zflowAppName = 'zflow';

/// Real runtime platform (android / web / windows / ...), defaults to `web`
/// when unknown so the handshake stays valid on exotic targets.
String zflowPlatformName() {
  if (kIsWeb) return 'web';
  switch (defaultTargetPlatform.name) {
    case 'android':
      return 'android';
    case 'iOS':
      return 'ios';
    case 'windows':
      return 'windows';
    case 'macOS':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'fuchsia':
      return 'fuchsia';
    default:
      // 鸿蒙 fork 新增平台枚举；按名称判断，并让 ZCode 旧协议沿用未知平台的 web 回退。
      return 'web';
  }
}
