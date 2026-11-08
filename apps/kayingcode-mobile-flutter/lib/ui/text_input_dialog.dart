import 'package:flutter/material.dart';

import '../l10n/strings.dart';

/// 文本输入对话框：控制器由对话框自身持有并随其销毁。
///
/// 调用方在 `await showDialog` 返回后立刻 `dispose()` 控制器，会在对话框
/// 退场动画期间触发 "A TextEditingController was used after being
/// disposed"（退场中的 TextField 仍监听控制器），进而打崩整棵组件树。
/// 把控制器所有权收敛到对话框内即可从根上避免。
///
/// 用 [TextInputDialog.show] 弹出；返回去除首尾空白后的文本，取消返回 null。
class TextInputDialog extends StatefulWidget {
  final String title;

  /// 输入框提示（多行提示可含 \n）。
  final String? hintText;
  final String initial;
  final int maxLines;
  final bool autofocus;

  /// 确认按钮文案（如「添加」「保存」「重发」）。
  final String? confirmLabel;
  final TextStyle? inputStyle;

  const TextInputDialog({
    super.key,
    required this.title,
    this.hintText,
    this.initial = '',
    this.maxLines = 1,
    this.autofocus = false,
    this.confirmLabel,
    this.inputStyle,
  });

  static Future<String?> show(
    BuildContext context, {
    required String title,
    String? hintText,
    String initial = '',
    int maxLines = 1,
    bool autofocus = false,
    String? confirmLabel,
    TextStyle? inputStyle,
  }) {
    return showDialog<String>(
      context: context,
      builder: (_) => TextInputDialog(
        title: title,
        hintText: hintText,
        initial: initial,
        maxLines: maxLines,
        autofocus: autofocus,
        confirmLabel: confirmLabel,
        inputStyle: inputStyle,
      ),
    );
  }

  @override
  State<TextInputDialog> createState() => _TextInputDialogState();
}

class _TextInputDialogState extends State<TextInputDialog> {
  late final _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        maxLines: widget.maxLines,
        autofocus: widget.autofocus,
        style: widget.inputStyle,
        decoration: InputDecoration(
          hintText: widget.hintText,
          border: const OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(tr(context, 'dialog.cancel')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          child: Text(widget.confirmLabel ?? tr(context, 'dialog.save')),
        ),
      ],
    );
  }
}
