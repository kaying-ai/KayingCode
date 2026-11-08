import 'package:flutter/widgets.dart';

import 'app_locale.dart';

const List<String> _monthsEn = <String>[
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const List<String> _weekdaysZhCN = <String>[
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
  '周日',
];

const List<String> _weekdaysZhTW = <String>[
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六',
  '週日',
];

const List<String> _weekdaysEn = <String>[
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

bool _isEnglish(Locale locale) => locale.languageCode.toLowerCase() == 'en';
bool _isTraditional(Locale locale) => isTraditionalLocale(locale);

String _two(int v) => v.toString().padLeft(2, '0');

String _hhmm(DateTime time) => '${_two(time.hour)}:${_two(time.minute)}';

/// 会话/消息时间的中文式日期：`M月d日` / `YYYY年M月d日`；英文用 `Oct 20` /
/// `Oct 20, 2025`。
String _dateLabel(Locale locale, DateTime time, {required bool withYear}) {
  if (_isEnglish(locale)) {
    final month = _monthsEn[time.month - 1];
    return withYear ? '$month ${time.day}, ${time.year}' : '$month ${time.day}';
  }
  return withYear
      ? '${time.year}年${time.month}月${time.day}日'
      : '${time.month}月${time.day}日';
}

/// 会话最近活跃时间：刚刚 / N 分钟前 / N 小时前 / N 天前，超过一周落回日期
/// （昨天带时刻、本周内周X、更早日期）。
String relativeDayLabel(Locale locale, int millis, {DateTime? now}) {
  if (millis <= 0) return '';
  final time = DateTime.fromMillisecondsSinceEpoch(millis);
  final current = now ?? DateTime.now();
  final diff = current.difference(time);
  final en = _isEnglish(locale);
  final tw = _isTraditional(locale);
  if (diff.inMinutes < 1) return en ? 'just now' : (tw ? '剛剛' : '刚刚');
  if (diff.inHours < 1) {
    return en
        ? '${diff.inMinutes} min ago'
        : (tw ? '${diff.inMinutes} 分鐘前' : '${diff.inMinutes} 分钟前');
  }
  if (diff.inDays < 1) {
    return en
        ? '${diff.inHours} hr ago'
        : (tw ? '${diff.inHours} 小時前' : '${diff.inHours} 小时前');
  }
  if (diff.inDays < 7) {
    return en
        ? '${diff.inDays} days ago'
        : (tw ? '${diff.inDays} 天前' : '${diff.inDays} 天前');
  }
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(time.year, time.month, time.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo == 1) {
    final prefix = en ? 'Yesterday' : (tw ? '昨天' : '昨天');
    return '$prefix ${_hhmm(time)}';
  }
  if (daysAgo < 7) return weekdayShort(locale, time.weekday);
  return _dateLabel(locale, time, withYear: time.year != current.year);
}

/// 消息时间标签：今天 HH:mm，昨天带前缀，同年 `M月d日`，跨年带年份。
String messageTimeLabel(Locale locale, int? millis, {DateTime? now}) {
  if (millis == null || millis <= 0) return '';
  final time = DateTime.fromMillisecondsSinceEpoch(millis);
  final current = now ?? DateTime.now();
  final day = DateTime(time.year, time.month, time.day);
  final today = DateTime(current.year, current.month, current.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo == 0) return _hhmm(time);
  if (daysAgo == 1) {
    final prefix = _isEnglish(locale) ? 'Yesterday' : '昨天';
    return '$prefix ${_hhmm(time)}';
  }
  return '${_dateLabel(locale, time, withYear: time.year != current.year)} ${_hhmm(time)}';
}

/// 周几短名；[weekday] 取 `DateTime.weekday`（1=周一，7=周日）。
String weekdayShort(Locale locale, int weekday) {
  final index = (weekday - 1).clamp(0, 6);
  if (_isEnglish(locale)) return _weekdaysEn[index];
  return _isTraditional(locale) ? _weekdaysZhTW[index] : _weekdaysZhCN[index];
}

/// 用量数字的三档单位：中文万/百万/亿，英文 K/M/B；小值原样。
String compactCount(Locale locale, num value) {
  if (_isEnglish(locale)) {
    if (value >= 1000000000) {
      return '${(value / 1000000000).toStringAsFixed(1)} B';
    }
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)} M';
    }
    if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(1)} K';
    }
    return '$value';
  }
  if (value >= 100000000) {
    return '${(value / 100000000).toStringAsFixed(1)} 亿';
  }
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(1)} 百万';
  }
  if (value >= 10000) {
    return '${(value / 10000).toStringAsFixed(1)} 万';
  }
  return '$value';
}
