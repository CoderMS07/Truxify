import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/network_provider.dart';

class OfflineBannerOverlay extends StatelessWidget {
  final Widget child;

  const OfflineBannerOverlay({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final isOffline = context.watch<NetworkProvider>().isOffline;

    return Stack(
      children: [
        child,
        AnimatedPositioned(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          top: isOffline ? 0 : -100,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: SafeArea(
              bottom: false,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                color: Colors.red,
                child: const Text(
                  'No Internet Connection - Showing cached data',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    decoration: TextDecoration.none,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
