import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class NetworkProvider extends ChangeNotifier {
  bool _isOffline = false;
  late StreamSubscription<List<ConnectivityResult>> _subscription;

  bool get isOffline => _isOffline;

  NetworkProvider() {
    _initConnectivity();
    _subscription = Connectivity().onConnectivityChanged.listen(_updateConnectionStatus);
  }

  Future<void> _initConnectivity() async {
    try {
      final results = await Connectivity().checkConnectivity();
      _updateConnectionStatus(results);
    } catch (e) {
      debugPrint('Could not check connectivity status: $e');
    }
  }

  void _updateConnectionStatus(List<ConnectivityResult> results) {
    final offline = results.isNotEmpty && results.every((result) => result == ConnectivityResult.none);
    if (_isOffline != offline) {
      _isOffline = offline;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
