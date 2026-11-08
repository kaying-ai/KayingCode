import 'dart:typed_data';
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/channel_client.dart';
import 'package:kayingcode_mobile/protocol/ipc_codec.dart';
import 'package:kayingcode_mobile/protocol/zflow_client.dart';

void main() {
  test('新 attachment 在旧 socket 清理期间关闭时不报告恢复成功', () async {
    final oldClosed = Completer<void>();
    final stable = BridgeSession.fromAttachment(
      const {'workspaceKey': 'workspace-a'},
      channels: ChannelClient(sendBody: (_) {}),
      closeAttachment: () => oldClosed.future,
    );
    final replacement = BridgeSession.fromAttachment(
      const {'workspaceKey': 'workspace-a'},
      channels: ChannelClient(sendBody: (_) {}),
      closeAttachment: () async {},
    );
    final adopting = stable.adoptAttachmentFrom(replacement);
    stable.degraded.value = 'new-socket-closed';
    oldClosed.complete();
    await adopting;
    expect(stable.degraded.value, 'new-socket-closed');
    expect(stable.recovered.value, 0);
    stable.dispose();
  });
  test(
    'attachment replacement refuses a different persistent workspace target',
    () async {
      final stable = BridgeSession.fromAttachment(
        const {
          'workspaceKey': 'workspace-a',
          'nodeId': 'node-a',
          'serverId': 'server-a',
        },
        channels: ChannelClient(sendBody: (_) {}),
        closeAttachment: () async {},
      );
      final foreign = BridgeSession.fromAttachment(
        const {
          'workspaceKey': 'workspace-b',
          'nodeId': 'node-b',
          'serverId': 'server-b',
        },
        channels: ChannelClient(sendBody: (_) {}),
        closeAttachment: () async {},
      );
      await expectLater(stable.adoptAttachmentFrom(foreign), throwsStateError);
      expect(stable.workspaceKey, 'workspace-a');
      expect(stable.attachmentEpoch, 0);
      stable.dispose();
      foreign.dispose();
    },
  );
  test('attachment BridgeSession closes its socket exactly once', () async {
    var closeCount = 0;
    final session = BridgeSession.fromAttachment(
      const {'bridgeSessionId': 'bridge-1', 'workspaceKey': 'workspace-1'},
      channels: ChannelClient(sendBody: (_) {}),
      closeAttachment: () async => closeCount++,
    );

    expect(session.workspaceKey, 'workspace-1');
    session.dispose();
    session.dispose();
    await Future<void>.delayed(Duration.zero);

    expect(closeCount, 1);
    expect(session.isDisposed, isTrue);
  });

  test(
    'attachment replacement preserves bridge identity and closes old socket',
    () async {
      var oldCloseCount = 0;
      var nextCloseCount = 0;
      final stable = BridgeSession.fromAttachment(
        const {'bridgeSessionId': 'bridge-old', 'workspaceKey': 'workspace-1'},
        channels: ChannelClient(sendBody: (_) {}),
        closeAttachment: () async => oldCloseCount++,
      );
      final replacement = BridgeSession.fromAttachment(
        const {'bridgeSessionId': 'bridge-new', 'workspaceKey': 'workspace-1'},
        channels: ChannelClient(sendBody: (_) {}),
        closeAttachment: () async => nextCloseCount++,
      );
      final recovered = <int>[];
      stable.recovered.addListener(() => recovered.add(stable.recovered.value));

      await stable.adoptAttachmentFrom(replacement);

      expect(stable.bridge['bridgeSessionId'], 'bridge-new');
      expect(stable.isDisposed, isFalse);
      expect(replacement.isDisposed, isTrue);
      expect(stable.attachmentEpoch, 1);
      expect(recovered, [1]);
      expect(oldCloseCount, 1);
      expect(nextCloseCount, 0);

      stable.dispose();
      await Future<void>.delayed(Duration.zero);
      expect(nextCloseCount, 1);
    },
  );

  test(
    'Node SocketProtocol framing initializes ChannelClient and frames RPC',
    () async {
      final sent = <Uint8List>[];
      final channels = ChannelClient(
        sendBody: sent.add,
        mapChannelName: (name) =>
            name == 'zcode-agent' ? 'kayingcode-agent' : name,
      );
      final parser = IpcFrameParser();
      final writer = ValueWriter();
      encodeValue(writer, [200]);
      final frame = IpcFraming.encode(writer.toBytes());

      expect(parser.acceptChunk(Uint8List.sublistView(frame, 0, 7)), isEmpty);
      for (final body in parser.acceptChunk(Uint8List.sublistView(frame, 7))) {
        channels.handleMessage(body);
      }
      await channels.ready;

      final pending = channels.call('zcode-agent', 'helloConversationV4', []);
      await Future<void>.delayed(Duration.zero);
      expect(sent, hasLength(1));
      final outbound = IpcFraming.encode(sent.single);
      final decoded = IpcFrameParser().acceptChunk(outbound);
      expect(decoded, hasLength(1));
      final reader = ValueReader(decoded.single);
      expect(decodeValue(reader), [
        100,
        0,
        'kayingcode-agent',
        'helloConversationV4',
      ]);
      expect(decodeValue(reader), isEmpty);
      final response = ValueWriter();
      encodeValue(response, [201, 0]);
      encodeValue(response, {'clientMode': 'web-remote-replayable'});
      for (final body in IpcFrameParser().acceptChunk(
        IpcFraming.encode(response.toBytes()),
      )) {
        channels.handleMessage(body);
      }
      expect(await pending, {'clientMode': 'web-remote-replayable'});
      channels.dispose();
    },
  );

  test('conversation owns one V4 client hello per attachment scope', () async {
    late ChannelClient channels;
    final methods = <String>[];
    final clientIds = <String>[];
    channels = ChannelClient(
      sendBody: (body) {
        final reader = ValueReader(body);
        final header = decodeValue(reader) as List;
        final args = decodeValue(reader) as List;
        final method = header[3] as String;
        methods.add(method);
        if (method == 'initializeConversationV4') {
          clientIds.add((args.single as Map)['clientId'] as String);
        }
        final response = ValueWriter();
        encodeValue(response, [201, header[1]]);
        encodeValue(
          response,
          method == 'helloConversationV4'
              ? {'clientMode': 'web-remote-replayable'}
              : null,
        );
        channels.handleMessage(response.toBytes());
      },
    );
    final initialize = ValueWriter();
    encodeValue(initialize, [200]);
    channels.handleMessage(initialize.toBytes());
    final bridge = BridgeSession.fromAttachment(
      const {'bridgeSessionId': 'bridge-2', 'workspaceKey': 'workspace-1'},
      channels: channels,
      closeAttachment: () async {},
    );
    final conversation = bridge.conversation(const {
      'workspacePath': '/workspace',
      'workspaceIdentity': 'workspace-1',
    });
    await conversation.handshake();
    await conversation.handshake();
    expect(methods, ['helloConversationV4', 'initializeConversationV4']);
    expect(clientIds.single, isNotEmpty);
    bridge.dispose();
  });

  test(
    'KayingCode models use the sanitized Host catalog, not workspace-config',
    () async {
      late ChannelClient channels;
      final methods = <String>[];
      int? eventId;
      channels = ChannelClient(
        sendBody: (body) {
          final reader = ValueReader(body);
          final header = decodeValue(reader) as List;
          final args = decodeValue(reader);
          final type = header[0] as int;
          final method = header[3] as String;
          if (type == ChannelClient.reqEventListen) {
            expect(method, 'onDynamicWorkspaceConfigFrame');
            eventId = header[1] as int;
            return;
          }
          if (type != ChannelClient.reqPromise) return;
          methods.add(method);
          final response = ValueWriter();
          encodeValue(response, [ChannelClient.resPromiseSuccess, header[1]]);
          encodeValue(response, switch (method) {
            'helloConversationV4' => {'clientMode': 'web-remote-replayable'},
            'subscribeWorkspaceConfigV4' => {
              'ack': {'subscriptionId': 'config-1'},
            },
            'getCatalog' => {
              'revision': 7,
              'preferredSelection': {
                'providerId': 'opencode-zen-chat',
                'modelId': 'big-pickle',
              },
              'providers': [
                {
                  'providerId': 'opencode-zen-chat',
                  'providerName': 'OpenCode Zen',
                  'models': [
                    {
                      'modelId': 'big-pickle',
                      'reasoningLevels': ['high'],
                    },
                  ],
                },
              ],
            },
            _ => null,
          });
          channels.handleMessage(response.toBytes());
          if (method == 'subscribeWorkspaceConfigV4') {
            expect((args as List).single['workspacePath'], '/workspace');
            final frame = ValueWriter();
            encodeValue(frame, [ChannelClient.resEventFire, eventId]);
            encodeValue(frame, {
              'wireVersion': 3,
              'kind': 'complete',
              'topic': 'workspace-config//workspace',
              'frame': {
                'subscriptionId': 'config-1',
                'toSeq': 1,
                'payload': {
                  'kind': 'snapshot',
                  'snapshot': {
                    'workspaceId': '/workspace',
                    'logEpoch': 'epoch-1',
                    'config': {'configOptions': [], 'slashCommands': []},
                  },
                },
              },
            });
            scheduleMicrotask(() => channels.handleMessage(frame.toBytes()));
          }
        },
      );
      final initialize = ValueWriter();
      encodeValue(initialize, [ChannelClient.resInitialize]);
      channels.handleMessage(initialize.toBytes());
      final bridge = BridgeSession.fromAttachment(
        const {
          'bridgeSessionId': 'bridge-models',
          'backendType': 'kayingcode',
          'workspaceKey': '/workspace',
        },
        channels: channels,
        closeAttachment: () async {},
      );
      final prep = await bridge.conversation(const {
        'workspacePath': '/workspace',
      }).prepareWorkspace();
      expect(
        prep.option('model')?.options.single.modelProviderName,
        'OpenCode Zen',
      );
      expect(
        prep.option('model')?.options.single.value,
        'opencode-zen-chat/big-pickle',
      );
      expect(methods, contains('getCatalog'));
      expect(methods, contains('subscribeWorkspaceConfigV4'));
      expect(methods, contains('unsubscribeWorkspaceConfigV4'));
      expect(methods, isNot(contains('prepareWorkspace')));
      bridge.dispose();
    },
  );
}
