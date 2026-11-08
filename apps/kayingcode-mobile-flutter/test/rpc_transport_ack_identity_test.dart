import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/protocol/crc32.dart';
import 'package:kayingcode_mobile/protocol/rpc_transport.dart';

/// 宿主入站帧的身份门槛：`bridgeSessionId`、`bridgeGeneration`、`recoveryId`
/// 三项严格相等，缺项即不匹配（`null != 7`）。只有过闸的载荷会释放宿主的重放
/// 缓冲；不过闸的一律静默丢弃（宿主重放缓冲 45s 宽限后判死桥）。
bool hostAcceptsFrame(Map<String, dynamic> identity, Map<String, dynamic> payload) {
  return payload['bridgeSessionId'] == identity['bridgeSessionId'] &&
      payload['bridgeGeneration'] == identity['bridgeGeneration'] &&
      payload['recoveryId'] == identity['recoveryId'];
}

Map<String, dynamic> inboundFrame(Uint8List message, {int messageSeq = 1}) => {
      'zcode_type': 'rpc-frame',
      'bridgeSessionId': 'bridge-1',
      'seq': 1,
      'messageSeq': messageSeq,
      'fragmentIndex': 0,
      'fragmentCount': 1,
      'messageBytes': message.length,
      'checksum': {'algorithm': 'crc32', 'value': Crc32.hexOf(message)},
      'dataBase64': base64Encode(message),
    };

void main() {
  test('ack 带全桥身份并通过宿主身份门槛', () {
    final sent = <Map<String, dynamic>>[];
    final transport = RpcFrameTransport(
      bridgeSessionId: 'bridge-1',
      bridgeGeneration: 7,
      recoveryId: 'recovery-1',
      sendPayload: sent.add,
    );
    const identity = {
      'bridgeSessionId': 'bridge-1',
      'bridgeGeneration': 7,
      'recoveryId': 'recovery-1',
    };

    expect(transport.acceptPayload(inboundFrame(Uint8List.fromList([1, 2, 3]))), isTrue);
    expect(sent, hasLength(1));
    expect(hostAcceptsFrame(identity, sent.single), isTrue);
    expect(sent.single.keys.toSet(), {
      'zcode_type',
      'bridgeSessionId',
      'bridgeGeneration',
      'recoveryId',
      'ackMessageSeq',
    });
    // 只带 bridgeSessionId 的 ack 正是宿主要丢的那种（重放缓冲永不释放）。
    expect(
      hostAcceptsFrame(identity, {
        'zcode_type': 'rpc-frame-ack',
        'bridgeSessionId': 'bridge-1',
        'ackMessageSeq': 1,
      }),
      isFalse,
    );
  });
}
