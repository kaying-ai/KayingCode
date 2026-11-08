import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;

class ZcodeAuthError implements Exception {
  final String reason;
  const ZcodeAuthError(this.reason);
  @override
  String toString() => reason;
}

class ZcodeLoginFlow {
  final String authorizeUrl;
  final int expiresAt;
  final int pollIntervalMs;
  const ZcodeLoginFlow(this.authorizeUrl, this.expiresAt, this.pollIntervalMs);
}

class _PendingLogin extends ZcodeLoginFlow {
  final String id;
  final String secret;
  int nextPollAt = 0;
  _PendingLogin(
    super.authorizeUrl,
    super.expiresAt,
    super.pollIntervalMs,
    this.id,
    this.secret,
  );
}

/// 按 origin 隔离的唯一账户所有者；JWT 不进入设备 URL、导出和日志。
class ZcodeAuthSession {
  final String origin;
  final http.Client _client;
  final int Function() _now;
  final Future<String?> Function()? _readJwt;
  final Future<void> Function(String?)? _writeJwt;
  String? _jwt;
  bool _loaded = false;
  int _generation = 0;
  _PendingLogin? _pending;
  Future<bool>? _pollFlight;
  Future<void> _storageFlight = Future.value();

  ZcodeAuthSession({
    required this.origin,
    http.Client? client,
    int Function()? now,
    Future<String?> Function()? readJwt,
    Future<void> Function(String?)? writeJwt,
  }) : _client = client ?? http.Client(),
       _now = now ?? (() => DateTime.now().millisecondsSinceEpoch),
       _readJwt = readJwt,
       _writeJwt = writeJwt {
    final uri = Uri.parse(origin);
    if (uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        uri.path.isNotEmpty) {
      throw ArgumentError('ZCode auth requires HTTPS origin');
    }
  }

  Future<bool> signedIn() async {
    if (!_loaded) {
      final generation = _generation;
      final stored = await _readJwt?.call();
      if (generation == _generation) {
        _jwt = stored;
        _loaded = true;
      }
    }
    return _jwt != null;
  }

  void cancelLogin() {
    _generation++;
    _pending = null;
    _pollFlight = null;
  }

  Future<void> _store(String? value, int generation) {
    final flight = _storageFlight.then((_) async {
      if (generation != _generation) return;
      await _writeJwt?.call(value);
      // 关闭时安全存储写入可能已开始；串行回滚后才允许下一次登录提交。
      if (generation != _generation) await _writeJwt?.call(null);
    });
    _storageFlight = flight.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return flight;
  }

  Future<void> logout() async {
    cancelLogin();
    _jwt = null;
    _loaded = true;
    await _store(null, _generation);
  }

  Future<Map<String, dynamic>> _request(
    String path,
    String token, [
    Object? body,
  ]) async {
    http.Response response;
    try {
      final headers = {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      };
      response =
          await (body == null
                  ? _client.get(Uri.parse('$origin$path'), headers: headers)
                  : _client.post(
                      Uri.parse('$origin$path'),
                      headers: headers,
                      body: jsonEncode(body),
                    ))
              .timeout(const Duration(seconds: 15));
    } catch (_) {
      throw const ZcodeAuthError('relay-unavailable');
    }
    if (response.statusCode == 401) throw const ZcodeAuthError('auth-required');
    if (response.statusCode != 200) {
      throw const ZcodeAuthError('relay-unavailable');
    }
    Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const ZcodeAuthError('relay-unavailable');
    }
    if (decoded is! Map || decoded['code'] != 0 || decoded['data'] is! Map) {
      throw const ZcodeAuthError('relay-unavailable');
    }
    return Map<String, dynamic>.from(decoded['data'] as Map);
  }

  Future<ZcodeLoginFlow> begin(String provider) async {
    if (provider != 'zai' && provider != 'bigmodel') {
      throw ArgumentError('Unsupported provider');
    }
    final closing = logout();
    final generation = _generation;
    await closing;
    if (generation != _generation) throw const ZcodeAuthError('login-expired');
    final random = Random.secure();
    final secret = List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final data = await _request('/api/v1/oauth/cli/init', secret, {
      'provider': provider,
    });
    if (generation != _generation) throw const ZcodeAuthError('login-expired');
    final id = data['flow_id'], url = data['authorize_url'];
    final expires = data['expires_at'], interval = data['poll_interval_sec'];
    final uri = url is String ? Uri.tryParse(url) : null;
    if (id is! String ||
        id.isEmpty ||
        uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        expires is! num ||
        !expires.isFinite ||
        interval is! num ||
        !interval.isFinite ||
        expires * 1000 <= _now() ||
        interval < 1 ||
        interval * 1000 >= expires * 1000 - _now()) {
      throw const ZcodeAuthError('login-failed');
    }
    final pending = _PendingLogin(
      url as String,
      (expires * 1000).toInt(),
      (interval * 1000).toInt(),
      id,
      secret,
    );
    _pending = pending;
    return pending;
  }

  Future<bool> poll() {
    final current = _pollFlight;
    if (current != null) return current;
    final flight = _poll();
    _pollFlight = flight;
    void clear() {
      if (identical(_pollFlight, flight)) _pollFlight = null;
    }

    flight.then<void>(
      (_) => clear(),
      onError: (Object _, StackTrace _) => clear(),
    );
    return flight;
  }

  Future<bool> _poll() async {
    final pending = _pending;
    if (pending == null) return signedIn();
    if (_now() >= pending.expiresAt) {
      cancelLogin();
      throw const ZcodeAuthError('login-expired');
    }
    if (_now() < pending.nextPollAt) return false;
    pending.nextPollAt = _now() + pending.pollIntervalMs;
    Map<String, dynamic> data;
    try {
      data = await _request(
        '/api/v1/oauth/cli/poll/${Uri.encodeComponent(pending.id)}',
        pending.secret,
      );
    } catch (_) {
      if (!identical(_pending, pending)) return false;
      rethrow;
    }
    if (!identical(_pending, pending)) return false;
    if (_now() >= pending.expiresAt) {
      cancelLogin();
      throw const ZcodeAuthError('login-expired');
    }
    if (data['status'] == 'pending') return false;
    final token = data['token'], user = data['user'];
    if (data['status'] != 'ready' ||
        token is! String ||
        token.isEmpty ||
        user is! Map ||
        user['user_id'] is! String) {
      cancelLogin();
      throw const ZcodeAuthError('login-failed');
    }
    final generation = _generation;
    await _store(token, generation);
    if (generation != _generation) return false;
    _jwt = token;
    _loaded = true;
    _pending = null;
    return true;
  }

  Future<String> getTerminalToken() async {
    final generation = _generation;
    if (!await signedIn() || generation != _generation) {
      throw const ZcodeAuthError('auth-required');
    }
    try {
      final data = await _request('/api/v1/remote/token', _jwt!, {
        'role': 'terminal',
      });
      if (generation != _generation) {
        throw const ZcodeAuthError('auth-required');
      }
      final token = data['token'];
      if (token is! String ||
          !RegExp(r'^[A-Za-z0-9_-]{22}$').hasMatch(token) ||
          data['expires_in'] is! num ||
          (data['expires_in'] as num) <= 0) {
        throw const ZcodeAuthError('relay-unavailable');
      }
      return token;
    } on ZcodeAuthError catch (error) {
      if (generation == _generation && error.reason == 'auth-required') {
        await logout();
      }
      rethrow;
    }
  }
}
