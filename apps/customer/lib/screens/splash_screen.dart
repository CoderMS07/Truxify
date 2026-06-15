// ==========================================
// 1. IMPORTS
// ==========================================
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../widgets/app_page_route.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  // ==========================================
  // 2. STATE VARIABLES
  // ==========================================
  VideoPlayerController? _controller;
  Timer? _navigationTimer;
  bool _isInitialized = false;
  bool _navigated = false;

  // ==========================================
  // 3. LIFECYCLE METHODS
  // ==========================================
  @override
  void initState() {
    super.initState();

    // Safety fallback timer to ensure user can always enter the app (video is 8 seconds)
    _navigationTimer = Timer(const Duration(seconds: 10), () {
      _navigateToLogin();
    });

    _initializeVideo();
  }

  @override
  void dispose() {
    _navigationTimer?.cancel();
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    super.dispose();
  }

  // ==========================================
  // 4. VIDEO INITIALIZATION
  // ==========================================
  Future<void> _initializeVideo() async {
    try {
      _controller = VideoPlayerController.asset(
        'assets/Truck_draws_logo_brand_colors_202606141957.mp4',
      );
      await _controller!.initialize();
      if (!mounted) return;

      setState(() {
        _isInitialized = true;
      });

      // Mute audio to satisfy browser autoplay requirements
      await _controller!.setVolume(0.0);
      _controller!.addListener(_videoListener);
      await _controller!.play();
    } catch (e) {
      debugPrint('Failed to initialize video player: $e');
      _navigateToLogin();
    }
  }

  // ==========================================
  // 5. EVENT LISTENERS & NAVIGATION
  // ==========================================
  void _videoListener() {
    if (!mounted) return;
    final value = _controller?.value;
    if (value != null && 
        value.isInitialized && 
        (value.position >= value.duration || 
         (!value.isPlaying && value.position >= value.duration - const Duration(milliseconds: 200)))) {
      _navigateToLogin();
    }
  }

  void _navigateToLogin() {
    if (_navigated) return;
    _navigated = true;
    _navigationTimer?.cancel();
    _controller?.removeListener(_videoListener);
    
    if (mounted) {
      Navigator.of(context).pushReplacement(
        AppPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  // ==========================================
// 6. UI BUILD METHOD
// ==========================================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF004D40), // Premium dark teal to match brand
      body: SizedBox.expand(
        child: _isInitialized && _controller != null
            ? FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: _controller!.value.size.width,
                  height: _controller!.value.size.height,
                  child: VideoPlayer(_controller!),
                ),
              )
            : const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              ),
      ),
    );
  }
}
