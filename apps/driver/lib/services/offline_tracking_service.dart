import 'dart:async';
import '../models/geohash_location_model.dart';

class OfflineTrackingService {
  final List<GeohashLocation> _offlineQueue = [];
  bool _isConnected = false;

  void setConnectivity(bool isConnected) {
    _isConnected = isConnected;
  }

  void recordLocation(double lat, double lon, double speedMph) {
    // Mock geohash generation (simplified for mock purposes)
    final latPart = (lat * 10000).toInt() % 100000;
    final lonPart = (lon * 10000).toInt() % 100000;
    final mockGeohash = 'dp3w${latPart}_$lonPart';
    
    final loc = GeohashLocation(
      geohash: mockGeohash,
      timestamp: DateTime.now(),
      speedMph: speedMph,
    );

    _offlineQueue.add(loc);
  }

  List<GeohashLocation> getQueue() => List.unmodifiable(_offlineQueue);

  Future<int> syncData() async {
    if (!_isConnected || _offlineQueue.isEmpty) return 0;
    
    await Future.delayed(const Duration(seconds: 1)); // simulate network sync
    
    final count = _offlineQueue.length;
    _offlineQueue.clear();
    return count;
  }
}
