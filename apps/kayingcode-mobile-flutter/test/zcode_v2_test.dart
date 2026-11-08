import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kayingcode_mobile/protocol/connection_params.dart';
import 'package:kayingcode_mobile/protocol/zcode_auth.dart';
import 'package:kayingcode_mobile/protocol/relay_frames.dart';
import 'package:kayingcode_mobile/protocol/relay_client.dart';
import 'package:web_socket_channel/io.dart';

void main() {
  test(
    'V2 socket uses token and ignores data before a matching auth_ack',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final peerReady = Completer<WebSocket>();
      server.listen(
        (request) async =>
            peerReady.complete(await WebSocketTransformer.upgrade(request)),
      );
      final params = ZflowConnectionParams.parse(
        'https://relay.example.com/remote/v4?sid=device&mid=machine',
      )!;
      Uri? opened;
      final logs = <String>[];
      final relay = RelayClient(
        params,
        getTerminalToken: () async => 'private-token',
        onLog: logs.add,
        socketFactory: (uri) {
          opened = uri;
          return IOWebSocketChannel.connect('ws://127.0.0.1:${server.port}');
        },
      );
      final firstPayload = relay.payloads.first;
      await relay.start();
      final peer = await peerReady.future;
      final init = Completer<Map>();
      peer.listen((data) {
        final frame = jsonDecode(data as String) as Map;
        if (frame['type'] == 'auth_init' && !init.isCompleted) {
          init.complete(frame);
        }
      });
      addTearDown(() async {
        await relay.dispose();
        await peer.close();
        await server.close(force: true);
      });
      final frame = await init.future.timeout(const Duration(seconds: 3));
      expect(opened!.path, '/api/v1/remote/ws2');
      expect(opened!.queryParameters['token'], 'private-token');
      expect(frame.containsKey('role'), isFalse);
      expect(frame['client_ts'], lessThan(10000000000));
      peer.add(
        jsonEncode({
          'type': 'data',
          'payload': {'zcode_type': 'early'},
        }),
      );
      peer.add(
        jsonEncode({
          'type': 'auth_ack',
          'device_sid': 'other',
          'pair_status': 'matched',
        }),
      );
      peer.add(
        jsonEncode({
          'type': 'data',
          'payload': {'zcode_type': 'wrong-device'},
        }),
      );
      peer.add(
        jsonEncode({
          'type': 'auth_ack',
          'device_sid': 'device',
          'pair_status': 'matched',
        }),
      );
      peer.add(
        jsonEncode({
          'type': 'data',
          'payload': {'zcode_type': 'accepted'},
        }),
      );
      expect(
        (await firstPayload.timeout(const Duration(seconds: 3)))['zcode_type'],
        'accepted',
      );
      expect(relay.state, RelayState.paired);
      expect(logs.any((line) => line.contains('private-token')), isFalse);
    },
  );
  test('disposed relay does not open a socket after a late token', () async {
    final pending = Completer<String>();
    var opened = false;
    final params = ZflowConnectionParams.parse(
      'https://relay.example.com/remote/v4?sid=device',
    )!;
    final relay = RelayClient(
      params,
      getTerminalToken: () => pending.future,
      socketFactory: (_) {
        opened = true;
        throw StateError('must not connect');
      },
    );
    final started = relay.start();
    await relay.dispose();
    pending.complete('late');
    await started;
    expect(opened, isFalse);
    expect(relay.state, RelayState.closed);
  });
  test('V2 links use ws2 and legacy proofs are rejected', () {
    expect(
      ZflowConnectionParams.parse(
        'https://zcode.z.ai/remote/v4?sid=test&hash=&t=',
      ),
      isNull,
    );
    final v2 = ZflowConnectionParams.parse(
      'https://zcode.z.ai/remote/v4?sid=test&mid=machine&app_version=3.16.3',
    )!;
    expect(v2.isV2, isTrue);
    expect(v2.relayWsUri.path, '/api/v1/remote/ws2');
    expect(
      ZflowConnectionParams.parse(
        'https://zcode.z.ai/remote/v4?sid=test&hash=secret&t=1',
      ),
      isNull,
    );
    expect(
      ZflowConnectionParams.parse(
        'https://zcode.z.ai/remote/v4?sid=test&hash=secret',
      ),
      isNull,
    );
    expect(
      ZflowConnectionParams.parse('http://zcode.z.ai/remote/v4?sid=test'),
      isNull,
    );
    final init = relayOutboundFrame(v2, {
      'type': 'auth_init',
      'role': 'terminal',
      'device_sid': 'test',
      'client_ts': 1700000000000,
    });
    expect(init.containsKey('role'), isFalse);
    expect(init['client_ts'], 1700000000);
    final heartbeat = relayOutboundFrame(v2, {
      'type': 'pair_status_query',
      'device_sid': 'test',
      'client_ts': 1700000000000,
    });
    expect(heartbeat.containsKey('device_sid'), isFalse);
  });
  test(
    'OAuth pending/ready, secure storage and terminal token request',
    () async {
      var now = 1000;
      String? stored;
      final requests = <http.Request>[];
      var answer = <String, dynamic>{
        'code': 0,
        'data': {
          'flow_id': 'flow',
          'authorize_url': 'https://chat.z.ai/login',
          'expires_at': 301,
          'poll_interval_sec': 2,
        },
      };
      final auth = ZcodeAuthSession(
        origin: 'https://relay.example.com',
        now: () => now,
        readJwt: () async => stored,
        writeJwt: (value) async {
          stored = value;
        },
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(jsonEncode(answer), 200);
        }),
      );
      final flow = await auth.begin('zai');
      expect(flow.authorizeUrl, 'https://chat.z.ai/login');
      expect(
        requests.first.headers['Authorization'],
        matches(RegExp(r'^Bearer [a-f0-9]{64}$')),
      );
      answer = {
        'code': 0,
        'data': {'status': 'pending'},
      };
      expect(await auth.poll(), isFalse);
      expect(await auth.poll(), isFalse);
      expect(requests.length, 2);
      now += 2000;
      answer = {
        'code': 0,
        'data': {
          'status': 'ready',
          'token': 'jwt',
          'user': {'user_id': 'u'},
        },
      };
      expect(await auth.poll(), isTrue);
      expect(stored, 'jwt');
      answer = {
        'code': 0,
        'data': {'token': 'a' * 22, 'expires_in': 60},
      };
      expect(await auth.getTerminalToken(), 'a' * 22);
      expect(requests.last.url.path, '/api/v1/remote/token');
      expect(jsonDecode(requests.last.body), {'role': 'terminal'});
      expect(requests.last.headers['Authorization'], 'Bearer jwt');
    },
  );
  test('closing OAuth rejects late ready results', () async {
    final ready = Completer<http.Response>();
    var calls = 0;
    final auth = ZcodeAuthSession(
      origin: 'https://relay.example.com',
      client: MockClient((request) async {
        if (++calls == 1) {
          return http.Response(
            jsonEncode({
              'code': 0,
              'data': {
                'flow_id': 'f',
                'authorize_url': 'https://chat.z.ai/login',
                'expires_at':
                    DateTime.now().millisecondsSinceEpoch ~/ 1000 + 300,
                'poll_interval_sec': 2,
              },
            }),
            200,
          );
        }
        return ready.future;
      }),
    );
    await auth.begin('bigmodel');
    final flight = auth.poll();
    auth.cancelLogin();
    ready.complete(
      http.Response(
        jsonEncode({
          'code': 0,
          'data': {
            'status': 'ready',
            'token': 'late',
            'user': {'user_id': 'u'},
          },
        }),
        200,
      ),
    );
    expect(await flight, isFalse);
    expect(await auth.signedIn(), isFalse);
  });
  test(
    'saved account JWT is scoped by injected storage and 401 clears it',
    () async {
      String? saved = 'expired';
      final auth = ZcodeAuthSession(
        origin: 'https://relay.example.com',
        readJwt: () async => saved,
        writeJwt: (value) async {
          saved = value;
        },
        client: MockClient((request) async => http.Response('{}', 401)),
      );
      await expectLater(
        auth.getTerminalToken(),
        throwsA(
          isA<ZcodeAuthError>().having(
            (e) => e.reason,
            'reason',
            'auth-required',
          ),
        ),
      );
      expect(saved, isNull);
      expect(await auth.signedIn(), isFalse);
    },
  );
}
