import 'package:flutter/foundation.dart';

class ObdTelemetry {
  final double? engineTemperature;
  final double? oilLevel;
  final double? tirePressureAvg;
  final double? predictiveHealthScore;
  final List<String> warnings;

  ObdTelemetry({
    this.engineTemperature,
    this.oilLevel,
    this.tirePressureAvg,
    this.predictiveHealthScore,
    required this.warnings,
  });

  factory ObdTelemetry.fromJson(Map<String, dynamic> json) {
    final et = json['engineTemperature']?.toDouble();
    final ol = json['oilLevel']?.toDouble();
    final tp = json['tirePressureAvg']?.toDouble();
    final ph = json['predictiveHealthScore']?.toDouble();
    if (et == null) debugPrint('ObdTelemetry: engineTemperature missing or null');
    if (ol == null) debugPrint('ObdTelemetry: oilLevel missing or null');
    if (tp == null) debugPrint('ObdTelemetry: tirePressureAvg missing or null');
    if (ph == null) debugPrint('ObdTelemetry: predictiveHealthScore missing or null');
    return ObdTelemetry(
      engineTemperature: et,
      oilLevel: ol,
      tirePressureAvg: tp,
      predictiveHealthScore: ph,
      warnings: List<String>.from(json['warnings'] ?? []),
    );
  }
}
