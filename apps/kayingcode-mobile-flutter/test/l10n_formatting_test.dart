import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/l10n/app_locale.dart';
import 'package:kayingcode_mobile/l10n/formatting.dart';

void main() {
  final now = DateTime(2026, 11, 11, 12, 0);

  int millis(DateTime time) => time.millisecondsSinceEpoch;

  test('俄语消息时间标签', () {
    expect(
      messageTimeLabel(
        appLocaleRuRU,
        millis(DateTime(2026, 11, 11, 9, 5)),
        now: now,
      ),
      '09:05',
    );
    expect(
      messageTimeLabel(
        appLocaleRuRU,
        millis(DateTime(2026, 11, 10, 9, 5)),
        now: now,
      ),
      'Вчера 09:05',
    );
    expect(
      messageTimeLabel(
        appLocaleRuRU,
        millis(DateTime(2026, 10, 20, 9, 5)),
        now: now,
      ),
      '20 окт., 09:05',
    );
    expect(
      messageTimeLabel(
        appLocaleRuRU,
        millis(DateTime(2025, 12, 31, 9, 5)),
        now: now,
      ),
      '31 дек. 2025 г., 09:05',
    );
  });

  test('俄语相对时间与周几', () {
    expect(
      relativeDayLabel(
        appLocaleRuRU,
        millis(now.subtract(const Duration(seconds: 30))),
        now: now,
      ),
      'только что',
    );
    expect(
      relativeDayLabel(
        appLocaleRuRU,
        millis(now.subtract(const Duration(minutes: 5))),
        now: now,
      ),
      '5 мин назад',
    );
    expect(
      relativeDayLabel(
        appLocaleRuRU,
        millis(now.subtract(const Duration(hours: 3))),
        now: now,
      ),
      '3 ч назад',
    );
    expect(
      relativeDayLabel(
        appLocaleRuRU,
        millis(now.subtract(const Duration(days: 2))),
        now: now,
      ),
      '2 дн. назад',
    );
    expect(
      relativeDayLabel(
        appLocaleRuRU,
        millis(now.subtract(const Duration(days: 8))),
        now: now,
      ),
      '3 нояб.',
    );
    expect(weekdayShort(appLocaleRuRU, 1), 'Пн');
    expect(weekdayShort(appLocaleRuRU, 7), 'Вс');
  });

  test('俄语紧凑数字单位使用逗号小数', () {
    expect(compactCount(appLocaleRuRU, 999), '999');
    expect(compactCount(appLocaleRuRU, 1500), '1,5 тыс.');
    expect(compactCount(appLocaleRuRU, 2500000), '2,5 млн');
    expect(compactCount(appLocaleRuRU, 3200000000), '3,2 млрд');
  });
}
