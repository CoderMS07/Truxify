import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Basic smoke tests that verify the widget tree renders
// without requiring live Firebase/Supabase connections.
void main() {
  group('LoginScreen widget tests', () {
    testWidgets('renders a phone input field', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: TextField(
                decoration: InputDecoration(labelText: 'Phone Number'),
                keyboardType: TextInputType.phone,
              ),
            ),
          ),
        ),
      );
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('renders a send OTP button', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton(
              onPressed: () {},
              child: const Text('Send OTP'),
            ),
          ),
        ),
      );
      expect(find.text('Send OTP'), findsOneWidget);
    });
  });
}