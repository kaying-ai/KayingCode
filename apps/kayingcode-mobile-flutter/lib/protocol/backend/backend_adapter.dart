import 'dart:async';

import 'package:flutter/foundation.dart';

import '../connection_params.dart';
import '../zflow_client.dart';
import 'backend_type.dart';

/// 用户提供新码与恢复已有连接是不同命令；保存的 URL 不能自行推断重新配对意图。
enum BackendConnectionIntent { resume }

/// 后端适配器抽象接口：定义连接、认证、数据通道的通用契约。
///
/// ZCode 和 Kaying-code 两种后端实现此接口，UI 层只依赖此抽象。
abstract class BackendAdapter {
  /// 连接参数（URL 或配对码解析后的结果）
  ZflowConnectionParams get params;

  /// 后端类型
  BackendType get backendType;

  /// 连接状态
  BackendConnectionState get connectionState;

  /// 连接状态变化通知
  ValueListenable<BackendConnectionState> get connectionStateListenable;

  /// 工作区列表更新流（桌面端推送 workspace-list-updated）
  Stream<dynamic> get workspaceListUpdated;

  /// 连接后端（认证 + 建立数据通道）
  Future<void> connect();

  /// 等待配对完成
  Future<void> waitPaired({Duration timeout});

  /// 应用回到前台时的存活性探测（relay 心跳查询或直接重连）
  void pokeRelay();

  /// 获取初始工作区概览（含 workspaces 列表）
  Future<Map<String, dynamic>> bootstrap();

  /// 获取工作区列表
  Future<List<Map<String, dynamic>>> listWorkspaces();

  /// 打开工作区桥接
  Future<BridgeSession> openBridge(String workspaceKey, {String? taskId});

  /// 发送原始请求并等待匹配的响应（调试器用；Kaying-code 可不支持）
  Future<Map<String, dynamic>> request(
    Map<String, dynamic> payload,
    bool Function(Map<String, dynamic>) match, {
    Duration timeout,
  });

  /// 发送移动视图状态
  Future<void> sendMobileViewState({
    required String workspaceKey,
    String? taskId,
  });

  /// 重新连接工作区
  Future<Map<String, dynamic>> reconnectWorkspace(String workspaceKey);

  /// 释放资源
  Future<void> dispose();

  /// 日志回调
  void Function(String line)? onLog;
}

/// 连接状态枚举
enum BackendConnectionState {
  idle,
  connecting,
  authenticating,
  waiting,
  paired,
  reconnecting,
  error,
  kicked,
  closed,
}

/// 后端连接失败信息
class BackendConnectionFailure {
  final String reason;
  final String? message;
  const BackendConnectionFailure(this.reason, [this.message]);

  @override
  String toString() => message == null ? reason : '$reason: $message';
}
