import '../state/account_store.dart';
import '../protocol/backend/backend_type.dart';

// 当前 KayingCode 和 ZCode 都复用 Web；退役原生旧配对回退开关。
bool botUsesWebview(Account account, {bool enabled = true}) =>
    account.backendType == BackendType.kayingcode || enabled;

Future<Uri> resolveKayingcodeWebviewUri(Account account) async {
  final params = account.params;
  if (params?.isKayingcodeWebV2 != true) {
    throw const FormatException('Invalid V2 Web link');
  }
  // 原始 fragment 由网页单次消费；不发现旧配置接口或重建旧配对串。
  return Uri.parse(params!.raw);
}
