/// 一个区域的文案表：四张同 key 集合的常量表。
class AppStringTable {
  const AppStringTable({
    required this.area,
    required this.zhCN,
    required this.zhTW,
    required this.enUS,
    required this.ruRU,
  });

  final String area;
  final Map<String, String> zhCN;
  final Map<String, String> zhTW;
  final Map<String, String> enUS;
  final Map<String, String> ruRU;
}
