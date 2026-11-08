import '../platform/secure_storage.dart';
import '../protocol/connection_params.dart';
import '../protocol/zcode_auth.dart';

final _sessions = <String, ZcodeAuthSession>{};
const _secure = FlutterSecureStorage();

ZcodeAuthSession zcodeAuthFor(ZflowConnectionParams params) {
  final source = params.source;
  final origin = Uri(
    scheme: 'https',
    host: source.host,
    port: source.hasPort ? source.port : null,
  ).toString();
  return _sessions.putIfAbsent(origin, () {
    final key = 'zcode_auth_v2:$origin';
    return ZcodeAuthSession(
      origin: origin,
      readJwt: () => _secure.read(key: key),
      writeJwt: (value) => value == null
          ? _secure.delete(key: key)
          : _secure.write(key: key, value: value),
    );
  });
}
