import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/channel_client.dart';
import '../protocol/conversation.dart';
import '../protocol/id.dart';
import '../protocol/rpc_result.dart';
import '../protocol/zflow_client.dart';
import 'theme.dart';

/// Provider status, aligned with the desktop client (verified live):
/// custom providers carry NO `enabled` field and the official client still
/// shows them as 已启用 — so only an explicit `enabled == false` or a
/// `systemDisabledReason` means 已停用; a required-but-empty API key means
/// 未配置; everything else (including enabled-absent customs) is 已启用.
enum ProviderStatus { enabled, unconfigured, disabled }

class _ProviderActionSource {
  final int generation;
  final BridgeSession session;
  final String scopeKey;
  final Map<String, dynamic>? provider;

  const _ProviderActionSource({
    required this.generation,
    required this.session,
    required this.scopeKey,
    required this.provider,
  });
}

ProviderStatus providerStatusOf(Map<String, dynamic> p) {
  if (p['systemDisabledReason'] is String) return ProviderStatus.disabled;
  if (p['enabled'] == false) return ProviderStatus.disabled;
  final apiKey = p['apiKey'];
  if (p['apiKeyRequired'] == true && apiKey is String && apiKey.isEmpty) {
    return ProviderStatus.unconfigured;
  }
  return ProviderStatus.enabled;
}

String providerDisabledReasonText(String raw) => switch (raw) {
      'oauth_provider_inactive' => t('model.reason.oauthInactive'),
      'coding_plan_not_entitled' => t('model.reason.notEntitled'),
      'api_key_missing' => t('model.reason.apiKeyMissing'),
      _ => raw,
    };

/// 主供应商判别(spec §7.4:主供应商默认展开模型明细,其余折叠)。
/// 依据是 wire 协议里可验证的 `source` 字段:服务端下发的内置供应商
/// 不带 `source: 'custom'`(见 providerStatusOf 的对齐注释),仅用户
/// 自建项在本页保存时固定写入 `source: 'custom'`,故非 custom 即主。
bool isPrimaryProvider(Map<String, dynamic> p) => p['source'] != 'custom';

/// Node 只下发可选模型目录；按 Provider 归组展示，不携带任何密钥或配置写入口。
List<Map<String, dynamic>> nodeProvidersFromWorkspacePrep(WorkspacePrep prep) {
  final groups = <String, Map<String, dynamic>>{};
  for (final option in prep.option('model')?.options ?? const <ConfigOptionValue>[]) {
    final providerId = option.modelProviderId ?? option.value.split('/').first;
    if (providerId.isEmpty || option.value.isEmpty) continue;
    final modelId = option.value.contains('/')
        ? option.value.substring(option.value.lastIndexOf('/') + 1)
        : option.value;
    final group = groups.putIfAbsent(providerId, () => {
      'id': providerId,
      'name': option.modelProviderName ?? providerId,
      'models': <Map<String, dynamic>>[],
    });
    (group['models'] as List<Map<String, dynamic>>).add({
      'id': modelId,
      'name': option.name,
    });
  }
  return groups.values.toList();
}

/// Model providers management (model-provider channel: getAll/save/delete).
class ModelProvidersPage extends StatefulWidget {
  final BridgeSession session;
  final Map<String, dynamic> scope;

  const ModelProvidersPage({
    super.key,
    required this.session,
    required this.scope,
  });

  @override
  State<ModelProvidersPage> createState() => _ModelProvidersPageState();
}

class _ModelProvidersPageState extends State<ModelProvidersPage> {
  late ConversationTransport _transport;
  late BridgeSession _sourceSession;
  late Map<String, dynamic> _sourceScope;
  String _sourceScopeKey = '';
  int _sourceGeneration = 0;
  List<Map<String, dynamic>> _providers = const [];
  bool _loading = true;
  String? _error;
  int _loadGeneration = 0;
  int _liveModelsGeneration = 0;
  int _mutationGeneration = 0;
  bool get _isNodeCatalog => _sourceSession.bridge['backendType'] == 'kayingcode';

  /// 实时可用模型集(provider 注册表 id → 模型 id 集),取自
  /// prepareWorkspace 的 model 选项(宿主按当前订阅/注册表实时下发)。
  /// getAll 的 models 是配置存量,已下线模型仍会留在里面——用它对照
  /// 标注。拿不到(自建供应商/调用失败)时保持静态展示。
  Map<String, Set<String>> _liveModelsByProvider = const {};

  _ProviderActionSource _captureActionSource(Map<String, dynamic>? provider) =>
      _ProviderActionSource(
        generation: _sourceGeneration,
        session: _sourceSession,
        scopeKey: _sourceScopeKey,
        provider: provider,
      );

  bool _isCurrentActionSource(_ProviderActionSource source) {
    if (!_isCurrentSource(source.generation, source.session, source.scopeKey)) {
      return false;
    }
    final provider = source.provider;
    return provider == null || _providers.any((p) => identical(p, provider));
  }

  @override
  void initState() {
    super.initState();
    _sourceSession = widget.session;
    _sourceScope = Map<String, dynamic>.from(widget.scope);
    _sourceScopeKey = _scopeKey(_sourceScope);
    _transport = _sourceSession.conversation(_sourceScope);
    _load();
  }

  @override
  void didUpdateWidget(ModelProvidersPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextScopeKey = _scopeKey(widget.scope);
    final sourceChanged = !identical(oldWidget.session, widget.session) ||
        nextScopeKey != _sourceScopeKey;
    if (!sourceChanged) return;
    _sourceGeneration++;
    _loadGeneration++;
    _liveModelsGeneration++;
    _mutationGeneration++;
    _sourceSession = widget.session;
    _sourceScope = Map<String, dynamic>.from(widget.scope);
    _sourceScopeKey = nextScopeKey;
    _transport = _sourceSession.conversation(_sourceScope);
    setState(() {
      _providers = const [];
      _liveModelsByProvider = const {};
      _loading = true;
      _error = null;
    });
    _load();
  }

  String _scopeKey(Map<String, dynamic> scope) =>
      '${scope['workspacePath'] ?? ''}\u0000${scope['workspaceIdentity'] ?? ''}';

  bool _isCurrentSource(
          int generation, BridgeSession session, String scopeKey) =>
      mounted &&
      generation == _sourceGeneration &&
      identical(session, _sourceSession) &&
      scopeKey == _sourceScopeKey;

  @override
  void dispose() {
    _sourceGeneration++;
    _loadGeneration++;
    _liveModelsGeneration++;
    _mutationGeneration++;
    super.dispose();
  }

  Future<void> _load() async {
    final sourceGeneration = _sourceGeneration;
    final session = _sourceSession;
    final scopeKey = _sourceScopeKey;
    final generation = ++_loadGeneration;
    if (_isCurrentSource(sourceGeneration, session, scopeKey)) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final List<Map<String, dynamic>> providers;
      if (_isNodeCatalog) {
        // Node 的移动 attachment 不注册 model-provider；只读目录取自
        // workspace-config，同聊天模型选择器使用一份权威事实。
        final prep = await _transport.prepareWorkspace(refresh: true);
        providers = nodeProvidersFromWorkspacePrep(prep);
      } else {
        final res = await session.channels.call('model-provider', 'getAll', []);
        providers = res is List
            ? res.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
            : const [];
      }
      if (_isCurrentSource(sourceGeneration, session, scopeKey) &&
          generation == _loadGeneration) {
        setState(() {
          _providers = providers;
          _loading = false;
        });
      }
    } catch (e) {
      if (_isCurrentSource(sourceGeneration, session, scopeKey) &&
          generation == _loadGeneration) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
      return;
    }
    if (!_isNodeCatalog && _isCurrentSource(sourceGeneration, session, scopeKey) &&
        generation == _loadGeneration) {
      unawaited(_loadLiveModels(
        sourceGeneration: sourceGeneration,
        session: session,
        scopeKey: scopeKey,
      ));
    }
  }

  /// 实时可用模型:与聊天模型选择面板同源(prepareWorkspace 的 model
  /// 选项,含 modelProviderId)。按 provider 归组,供卡片对照标注。
  Future<void> _loadLiveModels({
    required int sourceGeneration,
    required BridgeSession session,
    required String scopeKey,
  }) async {
    final generation = ++_liveModelsGeneration;
    final transport = _transport;
    final transportGeneration = transport.prepGeneration;
    try {
      final prep = await transport.prepareWorkspace(refresh: true);
      if (!_isCurrentSource(sourceGeneration, session, scopeKey) ||
          generation != _liveModelsGeneration ||
          transportGeneration != transport.prepGeneration) {
        return;
      }
      final modelOption = prep.option('model');
      if (modelOption == null) return;
      final sets = <String, Set<String>>{};
      for (final value in modelOption.options) {
        final pid = value.modelProviderId;
        final modelId = value.value.contains('/')
            ? value.value.substring(value.value.lastIndexOf('/') + 1)
            : value.value;
        if (pid == null || pid.isEmpty || modelId.isEmpty) {
          continue;
        }
        sets.putIfAbsent(pid, () => {}).add(modelId);
      }
      if (_isCurrentSource(sourceGeneration, session, scopeKey) &&
          generation == _liveModelsGeneration) {
        setState(() => _liveModelsByProvider = sets);
      }
    } catch (_) {
      // 实时集不可得(如自建供应商场景):保持静态展示,不打扰。
    }
  }

  Future<void> _save(
    Map<String, dynamic> provider, {
    required _ProviderActionSource source,
  }) async {
    if (!_isCurrentActionSource(source)) return;
    final res = await source.session.channels.call('model-provider', 'save', [
      {
        ...provider,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      },
    ]);
    // 无 status 的直接返回保持兼容;明确 rejected 走调用方的错误提示。
    if (isRpcRejected(res)) throw Exception(rpcFailureReason(res));
  }

  Future<void> _toggle(Map<String, dynamic> provider, bool enabled) async {
    final source = _captureActionSource(provider);
    final mutationGeneration = ++_mutationGeneration;
    if (!_isCurrentActionSource(source)) return;
    try {
      await _save({...provider, 'enabled': enabled}, source: source);
      if (!_isCurrentActionSource(source) ||
          mutationGeneration != _mutationGeneration) {
        return;
      }
      await _load();
    } catch (e) {
      if (_isCurrentActionSource(source) &&
          mutationGeneration == _mutationGeneration) {
        _toast('model.toggleFailed', args: {'error': e});
      }
    }
  }

  Future<void> _delete(Map<String, dynamic> provider) async {
    final source = _captureActionSource(provider);
    if (!_isCurrentActionSource(source)) return;
    final mutationGeneration = ++_mutationGeneration;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr(context, 'model.deleteTitle')),
        content: Text(
          tr(
            context,
            'model.deleteBody',
            args: {'name': provider['name']},
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr(context, 'dialog.cancel'))),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: EmberColors.of(context).err),
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr(context, 'action.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true ||
        !_isCurrentActionSource(source) ||
        mutationGeneration != _mutationGeneration) {
      return;
    }
    try {
      if (!_isCurrentActionSource(source)) return;
      final res = await source.session.channels.call('model-provider',
          'delete', [
        {'id': provider['id']},
      ]);
      // 明确 rejected 说明宿主理解了请求,fallback 换形状无意义,直接报错。
      if (isRpcRejected(res)) throw Exception(rpcFailureReason(res));
    } on ChannelRpcError {
      // Fallback: try alternate parameter shape
      if (!_isCurrentActionSource(source) ||
          mutationGeneration != _mutationGeneration) {
        return;
      }
      try {
        if (!_isCurrentActionSource(source)) return;
        final res = await source.session.channels
            .call('model-provider', 'delete', [provider['id']]);
        if (isRpcRejected(res)) throw Exception(rpcFailureReason(res));
      } catch (e2) {
        if (_isCurrentActionSource(source) &&
            mutationGeneration == _mutationGeneration) {
          _toast('model.deleteFailed', args: {'error': e2});
        }
        return;
      }
    } catch (e) {
      if (_isCurrentActionSource(source) &&
          mutationGeneration == _mutationGeneration) {
        _toast('model.deleteFailed', args: {'error': e});
      }
      return;
    }
    if (!_isCurrentActionSource(source) ||
        mutationGeneration != _mutationGeneration) {
      return;
    }
    await _load();
  }

  void _toast(String key, {Map<String, Object?>? args}) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, key, args: args))),
      );
    }
  }

  Future<void> _showAddSheet() async {
    final source = _captureActionSource(null);
    final mutationGeneration = ++_mutationGeneration;
    if (!_isCurrentActionSource(source)) return;
    final added = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _AddProviderSheet(),
    );
    if (added == null ||
        !_isCurrentActionSource(source) ||
        mutationGeneration != _mutationGeneration) {
      return;
    }
    try {
      await _save(added, source: source);
      if (!_isCurrentActionSource(source) ||
          mutationGeneration != _mutationGeneration) {
        return;
      }
      await _load();
      if (_isCurrentActionSource(source) &&
          mutationGeneration == _mutationGeneration) {
        _toast('model.added');
      }
    } catch (e) {
      if (_isCurrentActionSource(source) &&
          mutationGeneration == _mutationGeneration) {
        _toast('model.addFailed', args: {'error': e});
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'model.title')),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      floatingActionButton: _isNodeCatalog ? null : FloatingActionButton.extended(
        onPressed: _showAddSheet,
        icon: const Icon(Icons.add),
        label: Text(tr(context, 'model.add')),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text(
                    tr(context, 'model.loadFailed', args: {'error': _error}),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _providers.isEmpty ? 1 : _providers.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      if (_providers.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(tr(context, 'model.emptyNode')),
                          ),
                        );
                      }
                      final p = _providers[index];
                      final status = providerStatusOf(p);
                      final active = status != ProviderStatus.disabled;
                      final endpoints = p['endpoints'];
                      final baseUrl = endpoints is Map
                          ? '${endpoints['baseURL'] ?? ''}'
                          : '';
                      final models =
                          p['models'] is List ? p['models'] as List : [];
                      final modelIds = models
                          .whereType<Map>()
                          .map((m) => '${m['id'] ?? m['name'] ?? ''}')
                          .where((s) => s.isNotEmpty)
                          .toSet();
                      final liveModels = _liveModelsByProvider['${p['id']}'];
                      final availableCount =
                          liveModels?.intersection(modelIds).length;
                      final disabledReason =
                          p['systemDisabledReason'] as String?;
                      // 状态徽三色(spec §7.4):已启用绿 / 未配置黄 / 已停用灰。
                      final (statusLabel, statusColor) = switch (status) {
                        ProviderStatus.enabled => (
                            tr(context, 'model.statusEnabled'),
                            colors.ok,
                          ),
                        ProviderStatus.unconfigured => (
                            tr(context, 'model.statusUnconfigured'),
                            colors.warn,
                          ),
                        ProviderStatus.disabled => (
                            tr(context, 'model.statusDisabled'),
                            colors.textFaint,
                          ),
                      };
                      // 主供应商(spec §7.4)——判别依据见 [isPrimaryProvider]。
                      final isMain = isPrimaryProvider(p);
                      return Card(
                        child: ExpansionTile(
                          initiallyExpanded: isMain,
                          tilePadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${p['name'] ?? p['id']}',
                                  style: TextStyle(
                                      fontSize: EmberType.emphasis,
                                      fontWeight: FontWeight.w600,
                                      color: colors.textSolid),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: statusColor.withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(5),
                                ),
                                child: Text(statusLabel,
                                    style: TextStyle(
                                        fontSize: EmberType.caption,
                                        color: statusColor)),
                              ),
                            ],
                          ),
                          subtitle: Text(
                            [
                              '${p['apiFormat'] ?? ''}',
                              if (models.isNotEmpty) ...[
                                if (availableCount != null)
                                  tr(
                                    context,
                                    'model.availableCount',
                                    args: {
                                      'available': availableCount,
                                      'total': models.length,
                                    },
                                  )
                                else
                                  tr(
                                    context,
                                    'model.modelCount',
                                    args: {'count': models.length},
                                  ),
                              ],
                              if (baseUrl.isNotEmpty) baseUrl,
                              if (status == ProviderStatus.disabled &&
                                  disabledReason != null)
                                providerDisabledReasonText(disabledReason),
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: TextStyle(
                                fontSize: EmberType.caption,
                                color: colors.textFaint),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          children: [
                            if (models.isEmpty)
                              Padding(
                                padding: const EdgeInsets.all(12),
                                child: Text(tr(context, 'model.noModels'),
                                    style: TextStyle(
                                        fontSize: EmberType.caption,
                                        color: colors.textFaint)),
                              )
                            else
                              Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 0, 16, 10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    for (final m in models.whereType<Map>())
                                      _modelLine(context, m,
                                          live: _liveModelsByProvider[
                                              '${p['id']}']),
                                  ],
                                ),
                              ),
                            if (!_isNodeCatalog) Padding(
                              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Switch(
                                    value: active,
                                    onChanged: (v) => _toggle(p, v),
                                  ),
                                  IconButton(
                                    icon: Icon(Icons.delete_outline,
                                        size: 18, color: colors.textFaint),
                                    onPressed: () => _delete(p),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

class _AddProviderSheet extends StatefulWidget {
  const _AddProviderSheet();

  @override
  State<_AddProviderSheet> createState() => _AddProviderSheetState();
}

class _AddProviderSheetState extends State<_AddProviderSheet> {
  final _nameController = TextEditingController();
  final _baseUrlController = TextEditingController();
  final _apiKeyController = TextEditingController();
  final _modelsController = TextEditingController();
  String _apiFormat = 'anthropic-messages';

  static const _formats = [
    'anthropic-messages',
    'openai-chat',
    'gemini',
  ];

  @override
  void dispose() {
    _nameController.dispose();
    _baseUrlController.dispose();
    _apiKeyController.dispose();
    _modelsController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    final baseUrl = _baseUrlController.text.trim();
    if (name.isEmpty || baseUrl.isEmpty) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final modelIds = _modelsController.text
        .split(RegExp(r'[,\n]'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    final kind = _apiFormat.startsWith('anthropic')
        ? 'anthropic'
        : _apiFormat.startsWith('openai')
            ? 'openai'
            : 'gemini';
    Navigator.pop(context, {
      'id': 'custom:${generateUuid()}',
      'name': name,
      'enabled': true,
      'endpoints': {
        'baseURL': baseUrl,
        'paths': {kind: '/v1/messages'},
      },
      'apiFormat': _apiFormat,
      'source': 'custom',
      if (_apiKeyController.text.trim().isNotEmpty)
        'apiKey': _apiKeyController.text.trim(),
      'defaultKind': kind,
      'models': [
        for (var i = 0; i < modelIds.length; i++)
          {
            'id': modelIds[i],
            'kinds': [kind],
            'defaultKind': kind,
            'modalities': {
              'input': ['text'],
              'output': ['text'],
            },
            'priority': 100 + i,
          },
      ],
      'createdAt': now,
      'updatedAt': now,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(tr(context, 'model.addTitle'),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
                labelText: tr(context, 'model.nameLabel'),
                hintText: tr(context, 'model.nameHint')),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _apiFormat,
            decoration: InputDecoration(
                labelText: tr(context, 'model.apiFormat')),
            items: [
              for (final f in _formats)
                DropdownMenuItem(value: f, child: Text(f)),
            ],
            onChanged: (v) => setState(() => _apiFormat = v ?? _apiFormat),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _baseUrlController,
            decoration: const InputDecoration(
                labelText: 'Base URL',
                hintText: 'https://api.example.com/api/anthropic'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _apiKeyController,
            obscureText: true,
            decoration: InputDecoration(
                labelText: tr(context, 'model.apiKeyOptional')),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _modelsController,
            maxLines: 2,
            decoration: InputDecoration(
                labelText: tr(context, 'model.modelIdsLabel'),
                hintText: 'GLM-5.2, GLM-5-Turbo'),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _submit,
              child: Text(tr(context, 'dialog.save')),
            ),
          ),
        ],
      ),
    );
  }
}

/// One model line inside a provider's expansion: id · context window ·
/// max output · reasoning levels.
/// [live] 为 null 表示没有该供应商的实时数据(自建供应商),原样展示;
/// 非 null 时模型不在集合内 = 已下线,弱化并标注。
Widget _modelLine(BuildContext context, Map<dynamic, dynamic> m,
    {Set<String>? live}) {
  final id = '${m['id'] ?? m['name'] ?? '?'}';
  final offline = live != null && !live.contains(id);
  final ctx = (m['contextWindow'] as num?)?.toInt();
  final maxOut = (m['maxOutputTokens'] as num?)?.toInt();
  final reasoning = m['reasoning'];
  final levels = reasoning is Map ? reasoning['levels'] : null;
  final levelNames = levels is Map ? levels.keys.toList().join('/') : '';
  String k(int? v) => v == null
      ? ''
      : v >= 1000000
          ? '${v ~/ 1000000}M'
          : '${(v / 1000).round()}k';
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Text(
      [
        id,
        if (offline) tr(context, 'model.offline'),
        if (!offline && ctx != null)
          tr(context, 'model.contextWindow', args: {'value': k(ctx)}),
        if (!offline && maxOut != null)
          tr(context, 'model.output', args: {'value': k(maxOut)}),
        if (!offline && levelNames.isNotEmpty)
          tr(context, 'model.reasoning', args: {'levels': levelNames}),
      ].join(' · '),
      style: TextStyle(
          fontSize: EmberType.caption,
          color: offline
              ? EmberColors.of(context).textFaint
              : EmberColors.of(context).textSoft,
          decoration: offline ? TextDecoration.lineThrough : null),
    ),
  );
}
