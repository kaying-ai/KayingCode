import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayingcode_mobile/main.dart' as app;

void main() {
  testWidgets(
    'first Flutter frame renders while startup preferences are slow',
    (tester) async {
      const preferences = MethodChannel(
        'plugins.flutter.io/shared_preferences',
      );
      final pendingPreferences = Completer<Object?>();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            preferences,
            (_) => pendingPreferences.future,
          );
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(preferences, null);
      });

      app.main();
      await tester.pump();

      expect(find.byType(MaterialApp), findsOneWidget);
      expect(find.byType(Scaffold), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const SizedBox.shrink());
      pendingPreferences.complete(<String, Object>{});
    },
  );
}
