class ObdTelemetryModel {
  final double engineTemperature;
  final double tirePressure;
  final double fluidLevels;
  final DateTime timestamp;

  ObdTelemetryModel({
    required this.engineTemperature,
    required this.tirePressure,
    required this.fluidLevels,
    required this.timestamp,
  });

  factory ObdTelemetryModel.fromJson(Map<String, dynamic> json) {
    return ObdTelemetryModel(
      engineTemperature: (json['engineTemperature'] ?? 0.0).toDouble(),
      tirePressure: (json['tirePressure'] ?? 0.0).toDouble(),
      fluidLevels: (json['fluidLevels'] ?? 0.0).toDouble(),
      timestamp: DateTime.parse(json['timestamp']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'engineTemperature': engineTemperature,
      'tirePressure': tirePressure,
      'fluidLevels': fluidLevels,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}
