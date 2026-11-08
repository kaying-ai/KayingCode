// 此文件是 chat_page.dart 的一部分(part):同库共享导入与私有类可见。
part of '../chat_page.dart';

/// "+"面板(U2):先出分类入口(Skills/斜杠命令/附件/添加上下文),
/// 点进分类再列明细,避免一打开就是一整面列表。
class _PlusSheet extends StatefulWidget {
  final List<_SlashItem> slashItems;
  final bool loading;
  final void Function(String insert) onSelect;
  final VoidCallback onAttach;
  final Future<void> Function() onRefresh;

  const _PlusSheet({
    required this.slashItems,
    required this.loading,
    required this.onSelect,
    required this.onAttach,
    required this.onRefresh,
  });

  @override
  State<_PlusSheet> createState() => _PlusSheetState();
}

class _PlusSheetState extends State<_PlusSheet> {
  /// null = 分类首页;'skills' / 'commands' = 对应明细列表。
  String? _section;

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final commands = widget.slashItems
        .where((i) => !i.isSkill)
        .toList(growable: false);
    final skills = widget.slashItems
        .where((i) => i.isSkill)
        .toList(growable: false);

    Widget section(String title, List<_SlashItem> items) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
            child: Text(
              tr(context, 'chat.composer.emptySection'),
              style: TextStyle(fontSize: 12, color: colors.textFaint),
            ),
          )
        else
          for (final item in items)
            ListTile(
              dense: true,
              leading: Text(
                item.isSkill ? r'$' : '/',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  fontFamily: EmberFonts.term,
                  color: colors.primary,
                ),
              ),
              title: Text(item.name, style: const TextStyle(fontSize: 13)),
              subtitle: item.description.isNotEmpty
                  ? Text(
                      item.description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: colors.textFaint),
                    )
                  : null,
              onTap: () => widget.onSelect(item.insert),
            ),
      ],
    );

    Widget body;
    if (_section == 'skills' || _section == 'commands') {
      body = section(
        _section == 'skills' ? 'Skills' : tr(context, 'chat.composer.slashCommands'),
        _section == 'skills' ? skills : commands,
      );
    } else {
      body = Column(
        children: [
          _plusCategory(
            context,
            Icons.auto_awesome_outlined,
            'Skills',
            tr(
              context,
              'chat.composer.itemCount',
              args: {'count': skills.length},
            ),
            () => setState(() => _section = 'skills'),
          ),
          _plusCategory(
            context,
            Icons.terminal,
            tr(context, 'chat.composer.slashCommands'),
            tr(
              context,
              'chat.composer.itemCount',
              args: {'count': commands.length},
            ),
            () => setState(() => _section = 'commands'),
          ),
          _plusCategory(
            context,
            Icons.attach_file,
            tr(context, 'chat.composer.attachments'),
            tr(context, 'chat.composer.chooseFileToUpload'),
            () => widget.onAttach(),
          ),
          _plusCategory(
            context,
            Icons.data_object_outlined,
            tr(context, 'chat.composer.addContext'),
            tr(context, 'chat.composer.chooseFileToQuote'),
            () => widget.onAttach(),
          ),
        ],
      );
    }

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Row(
                children: [
                  if (_section != null)
                    IconButton(
                      icon: const Icon(Icons.arrow_back, size: 18),
                      tooltip: tr(context, 'chat.composer.back'),
                      onPressed: () => setState(() => _section = null),
                    )
                  else
                    const SizedBox(width: 40),
                  Text(
                    _section == 'skills'
                        ? 'Skills'
                        : _section == 'commands'
                        ? tr(context, 'chat.composer.slashCommands')
                        : tr(context, 'chat.composer.insert'),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  if (widget.loading)
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    IconButton(
                      icon: Icon(
                        Icons.refresh,
                        size: 18,
                        color: colors.textMuted,
                      ),
                      tooltip: tr(context, 'chat.composer.refresh'),
                      onPressed: widget.onRefresh,
                    ),
                ],
              ),
            ),
          ),
          Flexible(child: SingleChildScrollView(child: body)),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _plusCategory(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
    VoidCallback onTap,
  ) {
    final colors = EmberColors.of(context);
    return ListTile(
      leading: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: colors.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(EmberRadius.control),
        ),
        child: Icon(icon, size: 18, color: colors.primary),
      ),
      title: Text(title, style: const TextStyle(fontSize: 14)),
      subtitle: Text(
        subtitle,
        style: TextStyle(fontSize: 11, color: colors.textFaint),
      ),
      trailing: Icon(Icons.chevron_right, size: 18, color: colors.textFaint),
      onTap: onTap,
    );
  }
}

/// 会话设置面板图标行(桌面同款布局)。按钮全部压缩密度,整行高度约为
/// 常规 IconButton 行的一半。
/// 协作模式元数据。
///
/// zh-CN 文案与桌面端 `packages/ui/src/i18n/locales/zh-CN.ts` 的
/// `mode.label.glm.*` / `mode.description.glm.*` 逐字一致（由
/// `test/chat_mode_copy_test.dart` 锁定），其余语言为对应翻译：
///   plan  → 计划模式/ 编辑前先出计划。
///   build → 变更前确认 / 改文件前先问我。
///   edit  → 自动编辑   / 自动编辑文件。
///   yolo  → 完全访问   / 减少确认次数。
///
/// 宿主实际下发 ask/edit/plan/full（桌面源码另有 build/yolo 别名），两套都覆盖。
const _modeAliases = {'ask': 'build', 'auto': 'edit', 'full': 'yolo'};

const _modeIcons = {
  'plan': Icons.edit_note_outlined,
  'build': Icons.front_hand_outlined,
  'edit': Icons.shield_outlined,
  'yolo': Icons.gpp_maybe_outlined,
};

String _canonicalMode(String value) {
  final normalized = value.toLowerCase();
  return _modeAliases[normalized] ?? normalized;
}

/// 协作模式标签(模式菜单与按钮共用);未知值原样返回。
String modeLabelOf(String value) {
  final key = 'mode.label.${_canonicalMode(value)}';
  return hasAppString(key) ? t(key) : value;
}

/// 协作模式描述(菜单副标题);未知值返回 null(回落原始 name)。
String? modeDescriptionOf(String value) {
  final key = 'mode.description.${_canonicalMode(value)}';
  return hasAppString(key) ? t(key) : null;
}

/// 协作模式图标(对齐桌面 `resolveModeOptionIcon` 的 lucide 映射):
/// plan→NotepadText、build→Hand、edit→ShieldCheck、yolo→ShieldAlert。
/// 未知值回落 Hand(桌面同款兜底)。
IconData modeIconOf(String value) {
  return _modeIcons[_canonicalMode(value)] ?? Icons.front_hand_outlined;
}

/// 高风险模式(警示色/横幅):计划与 YOLO(含 full 别名)。
bool modeIsHot(String value) {
  final v = _canonicalMode(value);
  return v == 'plan' || v == 'yolo';
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final BackendType? backendType;
  final bool sending;

  /// 会话运行中:占位文案切「排队」语义,输入为空时发送键变停止。
  final bool running;

  /// 排队中的乐观消息数(桌面 √N 徽标)。
  final int queueCount;

  /// 当前协作模式 value(空则不渲染模式按钮)与菜单回调。
  final String? modeValue;
  final VoidCallback? onPickMode;

  final VoidCallback onSend;
  final VoidCallback onStop;
  final VoidCallback onPlusMenu;
  final VoidCallback? onPickModel;
  final VoidCallback? onPickThought;
  final VoidCallback? onPickUsage;

  /// 洞察三面板(目标/编辑/后台)打开入口:原输入区上方把手迁入图标行
  /// (用户裁定);null = 无会话不显示。[insightsCount] 为后台运行计数
  /// 徽,> 0 时按钮右上角浮出。
  final VoidCallback? onOpenInsights;
  final int insightsCount;

  /// 上下文占用比例(usedTokens / maxTokens,0~1)。非空时输入栏的用量按钮
  /// 渲染成动态进度环,对齐桌面;null = 宿主未下发 token 数据,回落固定图标。
  final double? contextRatio;

  const _InputBar({
    required this.controller,
    required this.backendType,
    required this.sending,
    required this.running,
    required this.queueCount,
    this.modeValue,
    this.onPickMode,
    required this.onSend,
    required this.onStop,
    required this.onPlusMenu,
    this.onPickModel,
    this.onPickThought,
    this.onPickUsage,
    this.onOpenInsights,
    this.insightsCount = 0,
    this.contextRatio,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    final mode = modeValue;
    final modeHot = mode != null && modeIsHot(mode);
    final modeLabel = mode == null
        ? tr(context, 'chat.composer.mode')
        : modeLabelOf(mode);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 2, 2, 2),
          decoration: BoxDecoration(
            color: colors.card,
            borderRadius: BorderRadius.circular(EmberRadius.control + 4),
            border: Border.all(color: colors.hairline),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  // 旧文案写死 KayingCode，ZCode 会话会误显；使用路由捕获的后端类型。
                  hintText: running
                      ? tr(context, 'chat.composer.queueFollowUp')
                      : tr(
                          context,
                          'chat.composer.askHint',
                          args: {'agent': backendType?.displayName ?? 'Agent'},
                        ),
                  border: InputBorder.none,
                  isDense: true,
                ),
                textInputAction: TextInputAction.newline,
              ),
              Row(
                children: [
                  _barButton(
                    context,
                    icon: Icons.add,
                    tooltip: tr(context, 'chat.composer.plusTooltip'),
                    onPressed: sending ? null : onPlusMenu,
                  ),
                  if (mode != null)
                    _barLabel(
                      context,
                      label: modeLabel,
                      tooltip: tr(
                        context,
                        'chat.composer.modeTooltip',
                        args: {'mode': mode},
                      ),
                      color: modeHot ? colors.warn : colors.textMuted,
                      onPressed: sending ? null : onPickMode,
                    ),
                  if (onOpenInsights != null)
                    _barButton(
                      context,
                      // 原Icons.schema(直线方块网格)与底栏其余线性图标风格不搭,
                      // 且"schema"读起来像数据库模式而非"聚合面板"。改用 2x2 圆角
                      // 格,对应桌面 lucide LayoutDashboard 的聚合面板意象
                      // (桌面无 insights 聚合视图,这是移动端独有的三视图入口)。
                      icon: Icons.grid_view_rounded,
                      // tooltip 与面板内实际三个 chip 对齐:待办 / 文件 / 后台
                      // (旧文案写「目标 / 编辑 / 后台」,与实际不符)。
                      tooltip: tr(context, 'chat.composer.insightsTooltip'),
                      onPressed: onOpenInsights,
                      badge: insightsCount > 0 ? '$insightsCount' : null,
                    ),
                  if (queueCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(left: 2),
                      child: Text(
                        '√$queueCount',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                          color: colors.textMuted,
                        ),
                      ),
                    ),
                  const Spacer(),
                  if (onPickUsage != null)
                    _barCustom(
                      context,
                      // 桌面对齐:上下文占用用动态进度环
                      // (packages/ui/src/components/ai-elements/context.tsx),
                      // 而非固定图标。无 token 数据时回落到半环图标。
                      child: _contextRing(context, contextRatio),
                      tooltip: tr(context, 'chat.composer.usageTooltip'),
                      onPressed: onPickUsage,
                    ),
                  if (onPickModel != null)
                    _barButton(
                      context,
                      // 模型 = 推理算力载体，用芯片(memory)表达；桌面用 lucide Package
                      // (ModelConfigSelect.tsx:499 等 6 处)，但方盒在 22px 下过于平淡，
                      // 已在真机上试过并弃用。
                      // 刻意避开 Brain/Bot —— 桌面上它们分别是「思考档」与「子 agent」，
                      // 而本按钮紧邻思考档(psychology)，再用大脑类图标会撞脸。
                      icon: Icons.memory,
                      tooltip: tr(context, 'chat.composer.pickModel'),
                      onPressed: onPickModel,
                    ),
                  if (onPickThought != null)
                    _barButton(
                      context,
                      icon: Icons.psychology,
                      tooltip: tr(context, 'chat.composer.thoughtLevel'),
                      onPressed: onPickThought,
                    ),
                  _SendOrStop(
                    controller: controller,
                    sending: sending,
                    running: running,
                    onSend: onSend,
                    onStop: onStop,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 图标行按钮:常规紧凑尺寸。[badge] 非空时右上角浮出计数徽
  /// (后台运行任务数,原输入区把手徽标迁入)。
  Widget _barButton(
    BuildContext context, {
    required IconData icon,
    required String tooltip,
    required VoidCallback? onPressed,
    Color? color,
    String? badge,
  }) {
    return _withBadge(
      badge,
      colors: EmberColors.of(context),
      button: IconButton(
        onPressed: onPressed,
        tooltip: tooltip,
        visualDensity: VisualDensity.compact,
        icon: Icon(
          icon,
          size: 22,
          color: color ?? EmberColors.of(context).textMuted,
        ),
      ),
    );
  }

  /// 自定义图形按钮(非Icon 图标)。用于对齐桌面的动态进度环
  /// (packages/ui/src/components/ai-elements/context.tsx:81-110 的双circle SVG)。
  Widget _barCustom(
    BuildContext context, {
    required Widget child,
    required String tooltip,
    required VoidCallback? onPressed,
  }) {
    return IconButton(
      onPressed: onPressed,
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      icon: child,
    );
  }

  /// 上下文占用环:桌面对齐版——底环 25% 透明 + 进度环 70% 描边、
  /// 圆头、rotate(-90deg) 从12 点起绘,与桌面 gauge 视觉一致。
  /// 无 token 数据时回落到固定半环图标,保证按钮始终可见。
  Widget _contextRing(BuildContext context, double? ratio) {
    final colors = EmberColors.of(context);
    final size = 15.0;
    if (ratio == null) {
      return Icon(Icons.donut_small, size: 22, color: colors.textMuted);
    }
    final progress = ratio.clamp(0.0, 1.0);
    final color = progress > 0.8 ? colors.warn : colors.textMuted;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(progress: progress, color: color),
      ),
    );
  }

  /// 图标行文字按钮:模式缩写(两字)等非图标内容。
  Widget _barLabel(
    BuildContext context, {
    required String label,
    required String tooltip,
    required VoidCallback? onPressed,
    Color? color,
  }) {
    return IconButton(
      onPressed: onPressed,
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      icon: Text(
        label,
        style: TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
          color: color ?? EmberColors.of(context).textMuted,
        ),
      ),
    );
  }

  Widget _withBadge(
    String? badge, {
    required EmberColors colors,
    required Widget button,
  }) {
    if (badge == null) return button;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        button,
        Positioned(
          top: 2,
          right: 2,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: colors.primary,
              borderRadius: BorderRadius.circular(8),
            ),
            constraints: const BoxConstraints(minWidth: 14),
            child: Text(
              badge,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 9,
                height: 1.2,
                fontWeight: FontWeight.w600,
                color: colors.bg,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// 发送/停止键:会话运行中且输入为空 → 停止方块(桌面同款);其余状态
/// 为发送箭头(发送在途显转圈)。与图标行同高。
class _SendOrStop extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final bool running;
  final VoidCallback onSend;
  final VoidCallback onStop;

  const _SendOrStop({
    required this.controller,
    required this.sending,
    required this.running,
    required this.onSend,
    required this.onStop,
  });

  @override
  Widget build(BuildContext context) {
    final colors = EmberColors.of(context);
    const size = 40.0;
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) {
        final empty = value.text.trim().isEmpty;
        if (running && empty) {
          return Tooltip(
            message: tr(context, 'chat.stop'),
            child: InkWell(
              onTap: onStop,
              borderRadius: BorderRadius.circular(EmberRadius.control),
              child: Container(
                width: size,
                height: size,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.raise,
                  borderRadius: BorderRadius.circular(EmberRadius.control),
                ),
                child: Icon(Icons.stop, size: 24, color: colors.textSolid),
              ),
            ),
          );
        }
        return Tooltip(
          message: tr(context, 'chat.composer.send'),
          child: InkWell(
            onTap: sending ? null : onSend,
            customBorder: const CircleBorder(),
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.primary,
                shape: BoxShape.circle,
              ),
              child: sending
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: colors.onPrimary,
                      ),
                    )
                  : Icon(Icons.arrow_upward, color: colors.onPrimary, size: 24),
            ),
          ),
        );
      },
    );
  }
}

/// 上下文占用环绘制器,对齐桌面
/// packages/ui/src/components/ai-elements/context.tsx 的双 circle SVG:
/// 底环固定 25% 透明,进度环 70% 描边 + 圆头,从 12 点方向(-90°)起绘。
class _RingPainter extends CustomPainter {
  final double progress;
  final Color color;

  _RingPainter({required this.progress, required this.color});

  static const double _strokeWidth = 2.2;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (size.shortestSide - _strokeWidth) / 2;

    // 底环:全周25% 透明描边。
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..color = color.withValues(alpha: 0.25),
    );

    // 进度环:按占比截取圆头弧线。progress==0 时不画,避免留下一个圆点。
    if (progress <= 0) return;
    final sweep = 2 * 3.141592653589793 * progress;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      // 从 12 点方向开始(与桌面 rotate(-90deg) 一致)。
      -3.141592653589793 / 2,
      sweep,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..strokeCap = StrokeCap.round
        ..color = color.withValues(alpha: 0.7),
    );
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.color != color;
}
