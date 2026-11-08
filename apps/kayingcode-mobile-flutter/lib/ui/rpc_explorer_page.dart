import 'dart:convert';

import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../protocol/backend/backend_adapter.dart';
import 'theme.dart';

/// Raw relay payload explorer: send arbitrary `zcode_type` payloads and
/// inspect the matching response (by requestId).
/// 仅 ZCode 后端支持；Kaying-code 后端会直接返回 UnimplementedError。
class RpcExplorerPage extends StatefulWidget {
  final BackendAdapter client;

  const RpcExplorerPage({super.key, required this.client});

  @override
  State<RpcExplorerPage> createState() => _RpcExplorerPageState();
}

class _RpcExplorerPageState extends State<RpcExplorerPage> {
  final _payloadController = TextEditingController(
    text: '{\n  "zcode_type": "workspace-list-request"\n}',
  );
  String _output = '';
  bool _busy = false;

  @override
  void dispose() {
    _payloadController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    Map<String, dynamic> payload;
    try {
      payload = (jsonDecode(_payloadController.text) as Map)
          .cast<String, dynamic>();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _output = tr(context, 'rpc.parseFailed', args: {'error': e});
      });
      return;
    }
    payload['requestId'] ??=
        'explorer-${DateTime.now().millisecondsSinceEpoch}';
    final requestId = payload['requestId'] as String;
    setState(() {
      _busy = true;
      _output = tr(
        context,
        'rpc.sentWaiting',
        args: {'requestId': requestId},
      );
    });
    try {
      final res = await widget.client.request(
        payload,
        (p) => p['requestId'] == requestId,
        timeout: const Duration(seconds: 20),
      );
      if (!mounted) return;
      setState(() {
        _output = const JsonEncoder.withIndent('  ').convert(res);
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _output = tr(context, 'rpc.noResponse', args: {'error': e});
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr(context, 'rpc.title'))),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            TextField(
              controller: _payloadController,
              maxLines: 8,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              decoration: InputDecoration(
                border: const OutlineInputBorder(),
                labelText: tr(context, 'rpc.payloadLabel'),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: _busy ? null : _send,
              icon: const Icon(Icons.send),
              label: Text(tr(context, 'rpc.send')),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  border: Border.all(
                      color: EmberColors.of(context).hairline),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: SingleChildScrollView(
                  child: SelectableText(
                    _output,
                    style: TextStyle(
                        fontFamily: EmberFonts.term,
                        fontSize: EmberType.caption,
                        color: EmberColors.of(context).textSolid),
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
