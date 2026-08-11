import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

class ShimmerListItem extends StatelessWidget {
  final double height;
  final double width;
  final double borderRadius;

  const ShimmerListItem({
    super.key,
    this.height = 80,
    this.width = double.infinity,
    this.borderRadius = 12,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Shimmer.fromColors(
        baseColor: Colors.grey[300]!,
        highlightColor: Colors.grey[100]!,
        child: Container(
          height: height,
          width: width,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(borderRadius),
          ),
        ),
      ),
    );
  }
}

class ShimmerOrderCard extends StatelessWidget {
  const ShimmerOrderCard({super.key});

  @override
  Widget build(BuildContext context) {
    return const ShimmerListItem(height: 100);
  }
}

class ShimmerLoadCard extends StatelessWidget {
  const ShimmerLoadCard({super.key});

  @override
  Widget build(BuildContext context) {
    return const ShimmerListItem(height: 120);
  }
}
