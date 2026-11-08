import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../l10n/strings.dart';
import '../protocol/zcode_auth.dart';

class ZcodeLoginPage extends StatefulWidget {
  final ZcodeAuthSession auth;
  final Future<bool> Function(Uri)? openUrl;
  const ZcodeLoginPage({super.key, required this.auth, this.openUrl});
  @override
  State<ZcodeLoginPage> createState() => _ZcodeLoginPageState();
}

class _ZcodeLoginPageState extends State<ZcodeLoginPage> {
  ZcodeLoginFlow? _flow;
  Timer? _timer;
  bool _busy = false;
  bool _completed = false;
  String? _messageKey;

  @override
  void dispose() {
    _timer?.cancel();
    if (!_completed) widget.auth.cancelLogin();
    super.dispose();
  }

  Future<void> _check() async {
    try {
      final ready = await widget.auth.poll();
      if (!mounted || _completed) return;
      if (ready) {
        _completed = true;
        Navigator.of(context).pop(true);
      } else {
        setState(() => _messageKey = 'zcodeAuth.waiting');
      }
    } catch (error) {
      if (!mounted) return;
      if (error is ZcodeAuthError && error.reason != 'relay-unavailable') {
        _timer?.cancel();
        _flow = null;
      }
      setState(() => _messageKey = 'zcodeAuth.failed');
    }
  }

  Future<void> _start(String provider) async {
    if (_busy) return;
    _timer?.cancel();
    setState(() {
      _busy = true;
      _flow = null;
      _messageKey = null;
    });
    try {
      final flow = await widget.auth.begin(provider);
      if (!mounted) return;
      setState(() {
        _flow = flow;
        _messageKey = 'zcodeAuth.waiting';
      });
      _timer = Timer.periodic(
        Duration(milliseconds: flow.pollIntervalMs),
        (_) => unawaited(_check()),
      );
      final opened =
          await (widget.openUrl?.call(Uri.parse(flow.authorizeUrl)) ??
              launchUrl(
                Uri.parse(flow.authorizeUrl),
                mode: LaunchMode.externalApplication,
              ));
      if (mounted && !opened) {
        setState(() => _messageKey = 'zcodeAuth.openFailed');
      }
    } catch (_) {
      if (mounted) setState(() => _messageKey = 'zcodeAuth.failed');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'zcodeAuth.title'))),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(tr(context, 'zcodeAuth.description')),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : () => _start('zai'),
              child: Text(tr(context, 'zcodeAuth.zai')),
            ),
            OutlinedButton(
              onPressed: _busy ? null : () => _start('bigmodel'),
              child: Text(tr(context, 'zcodeAuth.bigmodel')),
            ),
            if (_flow != null) ...[
              OutlinedButton(
                onPressed: () async {
                  await Clipboard.setData(
                    ClipboardData(text: _flow!.authorizeUrl),
                  );
                  if (mounted) setState(() => _messageKey = 'zcodeAuth.copied');
                },
                child: Text(tr(context, 'zcodeAuth.copy')),
              ),
              OutlinedButton(
                onPressed: _check,
                child: Text(tr(context, 'zcodeAuth.check')),
              ),
            ],
            if (_messageKey != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(tr(context, _messageKey!)),
              ),
          ],
        ),
      ),
    ),
  );
}
