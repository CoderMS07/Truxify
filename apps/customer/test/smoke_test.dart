import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:truxify/app.dart';

void main() {
  testWidgets('shows the Truxify splash screen', (tester) async {
    await tester.pumpWidget(const TruxifyApp());

    // Initially shows CircularProgressIndicator while video is loading/initializing
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // Pump and settle to trigger the video initialization catch block and route navigation
    await tester.pumpAndSettle();

    // Verify it navigated to the login screen
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Truxify'), findsOneWidget);
  });
}
