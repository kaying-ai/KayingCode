import 'dart:convert';

import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/channel_client.dart';
import '../protocol/zflow_client.dart';

/// Channel-level RPC explorer: call any method on any IPC channel
/// (zcode-task, zcode-agent, skills, mcp-sync, plugins, usage-stats, …).
class ChannelExplorerPage extends StatefulWidget {
  final BridgeSession session;

  const ChannelExplorerPage({super.key, required this.session});

  @override
  State<ChannelExplorerPage> createState() => _ChannelExplorerPageState();
}

class _ChannelExplorerPageState extends State<ChannelExplorerPage> {
  static const _channels = [
    Channels.zcodeTask,
    Channels.zcodeAgent,
    Channels.zcodeSession,
    Channels.file,
    Channels.git,
    Channels.system,
    Channels.setting,
    Channels.terminal,
    Channels.usageStats,
    Channels.modelProvider,
    Channels.skills,
    Channels.mcpSync,
    Channels.plugins,
    Channels.subagents,
    Channels.commands,
    Channels.memory,
    Channels.bots,
    Channels.credential,
    Channels.oauth,
    Channels.repoWiki,
    Channels.offPeakTask,
  ];

  String _channel = Channels.zcodeTask;
  final _methodController =
      TextEditingController(text: 'listTasks');
  final _argsController = TextEditingController(text: '[{}]');
  String _output = '';
  bool _busy = false;

  @override
  void dispose() {
    _methodController.dispose();
    _argsController.dispose();
    super.dispose();
  }

  Future<void> _call() async {
    List<Object?> args;
    try {
      final decoded = jsonDecode(_argsController.text);
      args = decoded is List ? decoded : [decoded];
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _output = tr(context, 'channel.parseFailed', args: {'error': e});
      });
      return;
    }
    setState(() {
      _busy = true;
      _output = tr(context, 'channel.calling');
    });
    try {
      final res = await widget.session.channels.call(
        _channel,
        _methodController.text.trim(),
        args,
        timeout: const Duration(seconds: 30),
      );
      if (!mounted) return;
      setState(() {
        _output = const JsonEncoder.withIndent('  ').convert(res);
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _output = tr(context, 'channel.failed', args: {'error': e});
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'channel.title'))),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _channel,
                    decoration: const InputDecoration(
                        labelText: 'channel', isDense: true),
                    items: [
                      for (final c in _channels)
                        DropdownMenuItem(value: c, child: Text(c)),
                    ],
                    onChanged: (v) =>
                        setState(() => _channel = v ?? _channel),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _methodController,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 13),
                    decoration: const InputDecoration(
                        labelText: 'method', isDense: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _argsController,
              maxLines: 5,
              style:
                  const TextStyle(fontFamily: 'monospace', fontSize: 12),
              decoration: InputDecoration(
                labelText: tr(context, 'channel.argsLabel'),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _call,
                icon: const Icon(Icons.send, size: 16),
                label: Text(tr(context, 'channel.call')),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SingleChildScrollView(
                  child: SelectableText(
                    _output,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 11),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
