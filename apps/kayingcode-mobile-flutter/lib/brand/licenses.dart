import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// 源码、迁入代码与字体的许可随包分发；LicensePage 按需读取，不阻塞启动。
void registerKayingCodeLicenses() {
  LicenseRegistry.addLicense(() async* {
    for (final (name, path) in [
      ('KayingCode', 'assets/licenses/APACHE-2.0.txt'),
      ('Zflow', 'assets/licenses/ZFLOW-MIT.txt'),
      ('Sarasa Gothic SC', 'assets/fonts/OFL.txt'),
    ]) {
      yield LicenseEntryWithLineBreaks([
        name,
      ], await rootBundle.loadString(path));
    }
  });
}
