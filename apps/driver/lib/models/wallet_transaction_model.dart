class WalletTransactionModel {
  final String id;
  final String? tripDisplayId;
  final double amount;
  final String txnType;
  final String status;
  final String description;
  final DateTime createdAt;

  WalletTransactionModel({
    required this.id,
    this.tripDisplayId,
    required this.amount,
    required this.txnType,
    required this.status,
    required this.description,
    required this.createdAt,
  });

  factory WalletTransactionModel.fromMap(Map<String, dynamic> map) {
    return WalletTransactionModel(
      id: map['id'],
      tripDisplayId: map['trip_display_id'],
      amount: (map['amount'] ?? 0) / 100.0,
      txnType: map['txn_type'] ?? '',
      status: map['status'] ?? '',
      description: map['description'] ?? '',
      createdAt: DateTime.parse(map['created_at']),
    );
  }
}
