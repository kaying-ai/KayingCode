import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/channel_client.dart';
import 'package:kayingcode_mobile/protocol/conversation.dart';
import 'package:kayingcode_mobile/protocol/ipc_codec.dart';
import 'package:kayingcode_mobile/protocol/zflow_client.dart';
import 'package:kayingcode_mobile/state/pending_command_ledger.dart';

class _MemoryPendingStorage implements PendingCommandStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async => this.value = value;
}

void main() {
  test(
    'ledger persists before use, scopes entries, and expires at fixed TTL',
    () async {
      final storage = _MemoryPendingStorage();
      var now = 1000;
      final ledger = PendingCommandLedger(storage: storage, clock: () => now);
      await ledger.record(
        scopeKey: 'relay/workspace-a',
        commandId: 'cmd-1',
        sessionId: 'session-1',
        type: 'sendText',
        text: 'draft text',
      );
      expect(storage.value, contains('draft text'));
      expect(await ledger.list('relay/workspace-b'), isEmpty);
      expect(
        (await ledger.list('relay/workspace-a')).single.expiresAt,
        1000 + pendingCommandTtl.inMilliseconds,
      );

      now += pendingCommandTtl.inMilliseconds;
      expect(await ledger.list('relay/workspace-a'), isEmpty);
      expect(storage.value, isNot(contains('draft text')));
    },
  );

  test(
    'ambiguous command is queried with the original id and never resent',
    () async {
      final methods = <String>[];
      final sentCommandIds = <String>[];
      late ChannelClient channels;
      channels = ChannelClient(
        sendBody: (body) {
          final reader = ValueReader(body);
          final header = decodeValue(reader) as List;
          final args = decodeValue(reader) as List;
          final method = header[3] as String;
          methods.add(method);
          if (method == 'sendConversationCommandV4') {
            final envelope = (args.single as Map)['envelope'] as Map;
            sentCommandIds.add(envelope['commandId'] as String);
            return; // Simulate ACK lost after command admission.
          }
          final response = ValueWriter();
          encodeValue(response, [201, header[1]]);
          if (method == 'helloConversationV4') {
            encodeValue(response, {'clientMode': 'web-remote-replayable'});
          } else if (method == 'queryConversationCommandsV4') {
            final query = args.single as Map;
            final command = (query['commands'] as List).single as Map;
            encodeValue(response, {
              'results': [
                {
                  'key': command,
                  'result': {
                    'status': 'accepted',
                    'result': {'type': 'sendText'},
                  },
                },
              ],
            });
          } else {
            encodeValue(response, null);
          }
          channels.handleMessage(response.toBytes());
        },
      );
      final initialize = ValueWriter();
      encodeValue(initialize, [200]);
      channels.handleMessage(initialize.toBytes());
      final ledger = PendingCommandLedger(storage: _MemoryPendingStorage());
      final bridge = BridgeSession.fromAttachment(
        const {
          'bridgeSessionId': 'bridge-ledger',
          'workspaceKey': 'workspace-a',
          'backendType': 'kayingcode',
          'relayOrigin': 'https://relay.example',
        },
        channels: channels,
        closeAttachment: () async {},
      );
      final transport = ConversationTransport(
        session: bridge,
        scope: const {
          'workspacePath': '/work',
          'workspaceIdentity': 'identity-a',
        },
        pendingLedger: ledger,
      );

      await transport.sendCommand('session-a', 'sendText', {
        'text': 'hello',
      }, timeout: const Duration(milliseconds: 5));

      expect(sentCommandIds, hasLength(1));
      expect(
        methods.where((method) => method == 'queryConversationCommandsV4'),
        hasLength(1),
      );
      final pending = await ledger.list(
        jsonEncode(['kayingcode', 'https://relay.example', 'identity-a']),
      );
      expect(pending, hasLength(1));
      expect(pending.single.commandId, sentCommandIds.single);
      expect(pending.single.acknowledged, isTrue);
      bridge.dispose();
    },
  );

  test('unknown command returns draft for explicit user submission', () async {
    final methods = <String>[];
    late ChannelClient channels;
    channels = ChannelClient(
      sendBody: (body) {
        final reader = ValueReader(body);
        final header = decodeValue(reader) as List;
        final args = decodeValue(reader) as List;
        final method = header[3] as String;
        methods.add(method);
        if (method == 'sendConversationCommandV4') return;
        final response = ValueWriter();
        encodeValue(response, [201, header[1]]);
        if (method == 'helloConversationV4') {
          encodeValue(response, {'clientMode': 'web-remote-replayable'});
        } else if (method == 'queryConversationCommandsV4') {
          final command = ((args.single as Map)['commands'] as List).single;
          encodeValue(response, {
            'results': [
              {'key': command, 'result': 'unknown'},
            ],
          });
        } else {
          encodeValue(response, null);
        }
        channels.handleMessage(response.toBytes());
      },
    );
    final initialize = ValueWriter();
    encodeValue(initialize, [200]);
    channels.handleMessage(initialize.toBytes());
    final ledger = PendingCommandLedger(storage: _MemoryPendingStorage());
    final bridge = BridgeSession.fromAttachment(
      const {
        'bridgeSessionId': 'bridge-unknown',
        'backendType': 'zcode',
        'relayOrigin': 'https://relay.example',
      },
      channels: channels,
      closeAttachment: () async {},
    );
    final transport = ConversationTransport(
      session: bridge,
      scope: const {'workspacePath': '/work'},
      pendingLedger: ledger,
    );
    await expectLater(
      transport.sendCommand('session-a', 'sendText', {
        'text': 'draft',
      }, timeout: const Duration(milliseconds: 5)),
      throwsA(
        isA<PendingCommandRestoredException>().having(
          (error) => error.text,
          'text',
          'draft',
        ),
      ),
    );
    expect(
      methods.where((method) => method == 'sendConversationCommandV4'),
      hasLength(1),
    );
    bridge.dispose();
  });

  test(
    'create and interaction timeout paths query instead of changing IDs',
    () async {
      final methods = <String>[];
      final idsByCommand = <String, String>{};
      late ChannelClient channels;
      channels = ChannelClient(
        sendBody: (body) {
          final reader = ValueReader(body);
          final header = decodeValue(reader) as List;
          final args = decodeValue(reader) as List;
          final method = header[3] as String;
          methods.add(method);
          final response = ValueWriter();
          encodeValue(response, [201, header[1]]);
          if (method == 'helloConversationV4') {
            encodeValue(response, {'clientMode': 'web-remote-replayable'});
          } else if (method == 'sendConversationCommandV4') {
            final envelope = (args.single as Map)['envelope'] as Map;
            idsByCommand[envelope['commandId'] as String] =
                envelope['type'] as String;
            return; // Both commands were admitted; their ACKs are lost.
          } else if (method == 'queryConversationCommandsV4') {
            final command =
                ((args.single as Map)['commands'] as List).single as Map;
            final commandId = command['commandId'] as String;
            final type = idsByCommand[commandId];
            encodeValue(response, {
              'results': [
                {
                  'key': command,
                  'result': {
                    'status': 'accepted',
                    'result': type == 'createSession'
                        ? {
                            'type': 'createSession',
                            'sessionId': 'recovered-session',
                          }
                        : {'type': 'interactionResolved'},
                  },
                },
              ],
            });
          } else {
            encodeValue(response, null);
          }
          channels.handleMessage(response.toBytes());
        },
      );
      final initialize = ValueWriter();
      encodeValue(initialize, [200]);
      channels.handleMessage(initialize.toBytes());
      final bridge = BridgeSession.fromAttachment(
        const {
          'bridgeSessionId': 'bridge-create-interaction',
          'backendType': 'zcode',
          'relayOrigin': 'https://relay.example',
        },
        channels: channels,
        closeAttachment: () async {},
      );
      final transport = ConversationTransport(
        session: bridge,
        scope: const {'workspacePath': '/work'},
        pendingLedger: PendingCommandLedger(storage: _MemoryPendingStorage()),
      );

      expect(
        await transport.createSession(
          'workspace-id',
          timeout: const Duration(milliseconds: 5),
        ),
        'recovered-session',
      );
      await transport
          .resolveInteraction(
            'session-a',
            'interaction-a',
            timeout: const Duration(milliseconds: 5),
          )
          .timeout(const Duration(seconds: 1));

      expect(idsByCommand, hasLength(2));
      expect(
        methods.where((method) => method == 'sendConversationCommandV4'),
        hasLength(2),
      );
      expect(
        methods.where((method) => method == 'queryConversationCommandsV4'),
        hasLength(2),
      );
      bridge.dispose();
    },
  );
}
