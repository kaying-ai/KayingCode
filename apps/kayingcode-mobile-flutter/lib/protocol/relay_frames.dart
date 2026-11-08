import 'connection_params.dart';

/// 当前 V2 使用秒级时间、无 role/proof，心跳不带 device_sid。
Map<String, dynamic> relayOutboundFrame(
  ZflowConnectionParams params,
  Map<String, dynamic> frame,
) {
  final result = {...frame};
  if (result['client_ts'] is num) {
    result['client_ts'] = (result['client_ts'] as num) ~/ 1000;
  }
  if (result['type'] == 'auth_init') result.remove('role');
  if (result['type'] == 'pair_status_query') result.remove('device_sid');
  return result;
}
