import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_controller.dart';
import '../maps/location_picker_screen.dart';
import 'full_screen_dashboard_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    void handleStartRide(AppController c) {
      if (c.currentBike == null) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Select a Bike'),
            content: const Text(
              'Please select a bike profile before starting a ride. '
              'This helps organize your ride data.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.pushNamed(context, '/bikes');
                },
                child: const Text('Select Bike'),
              ),
            ],
          ),
        );
      } else {
        c.startRideLogging();
      }
    }

    return Consumer<AppController>(
      builder: (context, c, _) {
        return Scaffold(
          extendBodyBehindAppBar: true,

          body: Stack(
            children: [
              // Decorative background glow - Top Right
              Positioned(
                top: -50,
                right: -50,
                child: Container(
                  width: 300,
                  height: 300,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                  ),
                ),
              ),
              // Decorative background glow - Bottom Left
              Positioned(
                bottom: 100,
                left: -100,
                child: Container(
                  width: 300,
                  height: 300,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.purpleAccent.withValues(alpha: 0.15),
                  ),
                ),
              ),
              // Blur layer to diffuse the circles
              Positioned.fill(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
                  child: const SizedBox(),
                ),
              ),
              // Main Content
              SafeArea(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SizedBox(height: 10),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Raptor',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 34,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Telemetry Command Center',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    _HeroCard(
                      controller: c,
                      onStart: () => handleStartRide(c),
                      onStop: c.stopRideLogging,
                    ),
                    const SizedBox(height: 16),

                    Text(
                      'Shortcuts',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final cardWidth = (constraints.maxWidth - 12) / 2;
                        return Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            _QuickActionCard(
                              title: 'Racing telemetry',
                              icon: Icons.speed,
                              width: cardWidth,
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const FullScreenDashboardScreen(),
                                  ),
                                );
                              },
                            ),
                            _QuickActionCard(
                              title: 'Add Location',
                              icon: Icons.add_location_alt,
                              width: cardWidth,
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const LocationPickerScreen(),
                                  ),
                                );
                              },
                            ),
                            _QuickActionCard(
                              title: 'Manage bikes',
                              icon: Icons.directions_bike,
                              width: cardWidth,
                              onTap: () =>
                                  Navigator.pushNamed(context, '/bikes'),
                            ),
                          ],
                        );
                      },
                    ),

                    const SizedBox(height: 16),
                    _SystemStatusCard(controller: c),
                    const SizedBox(height: 12),
                    _InfoBanner(
                      text:
                          'RAPTOR is read-only telemetry. No control signals are sent to the motorcycle.',
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.controller,
    required this.onStart,
    required this.onStop,
  });

  final AppController controller;
  final VoidCallback onStart;
  final Future<void> Function() onStop;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bikeName = controller.currentBike?.name ?? 'Select a bike to start';
    final bikeSubtitle = [
      controller.currentBike?.make,
      controller.currentBike?.model,
    ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
    final rideText = controller.isRideLogging
        ? 'Recording ride and sensors'
        : 'Ready when you are';
    final bikeImageUrl = _resolveBikeImageUrl();
    final showBikeVisual = controller.currentBike != null;

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.2),
                  blurRadius: 24,
                  spreadRadius: 1,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
          child: Stack(
            children: [
              if (showBikeVisual)
                Positioned(
                  top: 56,
                  right: -6,
                  child: _BikeModelPhoto(
                    imageUrl: bikeImageUrl,
                    bikeName: bikeName,
                  ),
                ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(
                            alpha: 0.15,
                          ),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: theme.colorScheme.primary.withValues(
                              alpha: 0.3,
                            ),
                          ),
                        ),
                        child: Icon(
                          Icons.dashboard_customize,
                          color: theme.colorScheme.primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Dashboard',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const Spacer(),
                      _TelemetryBadge(status: controller.telemetryDataStatus),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Padding(
                    padding: EdgeInsets.only(right: showBikeVisual ? 132 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          bikeName,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                        if (bikeSubtitle.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            bikeSubtitle,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72),
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.15,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(
                          rideText,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.6),
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      _DevicePill(
                        label: 'ESP32',
                        isActive: controller.isEsp32Connected,
                      ),
                      const SizedBox(width: 8),
                      _DevicePill(
                        label: 'OBD-II',
                        isActive: controller.isElm327Connected,
                      ),
                      const Spacer(),
                      if (controller.currentBike != null)
                        Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: controller.isRideLogging ? onStop : onStart,
                            borderRadius: BorderRadius.circular(30),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 12,
                              ),
                              decoration: BoxDecoration(
                                color: controller.isRideLogging
                                    ? Colors.redAccent.withValues(alpha: 0.2)
                                    : theme.colorScheme.primary.withValues(
                                        alpha: 0.9,
                                      ),
                                borderRadius: BorderRadius.circular(30),
                                border: Border.all(
                                  color: controller.isRideLogging
                                      ? Colors.redAccent.withValues(alpha: 0.4)
                                      : theme.colorScheme.primary,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    controller.isRideLogging
                                        ? Icons.stop
                                        : Icons.play_arrow_rounded,
                                    color: controller.isRideLogging
                                        ? Colors.redAccent
                                        : Colors.black,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    controller.isRideLogging
                                        ? 'Stop'
                                        : 'Start Ride',
                                    style: TextStyle(
                                      color: controller.isRideLogging
                                          ? Colors.redAccent
                                          : Colors.black,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _resolveBikeImageUrl() {
    final relativePath = controller.currentBike?.imageUrl;
    if (relativePath == null || relativePath.isEmpty) {
      return null;
    }
    if (relativePath.startsWith('http')) {
      return relativePath;
    }
    final cleanBaseUrl = controller.apiUrl.replaceAll('/api/v1', '');
    return '$cleanBaseUrl$relativePath';
  }
}

class _BikeModelPhoto extends StatelessWidget {
  const _BikeModelPhoto({required this.imageUrl, required this.bikeName});

  final String? imageUrl;
  final String bikeName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return IgnorePointer(
      child: SizedBox(
        width: 132,
        height: 94,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: RadialGradient(
                    center: const Alignment(0.25, 0.0),
                    radius: 0.95,
                    colors: [
                      theme.colorScheme.primary.withValues(alpha: 0.24),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: imageUrl == null
                    ? Icon(
                        Icons.motorcycle_rounded,
                        size: 50,
                        color: Colors.white.withValues(alpha: 0.55),
                      )
                    : ShaderMask(
                        blendMode: BlendMode.dstIn,
                        shaderCallback: (rect) {
                          return const LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              Colors.transparent,
                              Colors.white,
                              Colors.white,
                              Colors.transparent,
                            ],
                            stops: [0.0, 0.20, 0.84, 1.0],
                          ).createShader(rect);
                        },
                        child: Image.network(
                          imageUrl!,
                          fit: BoxFit.cover,
                          alignment: Alignment.centerLeft,
                          filterQuality: FilterQuality.high,
                          loadingBuilder: (context, child, progress) {
                            if (progress == null) return child;
                            return Center(
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    theme.colorScheme.primary,
                                  ),
                                ),
                              ),
                            );
                          },
                          errorBuilder: (context, error, stackTrace) {
                            return Icon(
                              Icons.motorcycle_rounded,
                              size: 50,
                              color: Colors.white.withValues(alpha: 0.55),
                            );
                          },
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DevicePill extends StatelessWidget {
  const _DevicePill({required this.label, required this.isActive});

  final String label;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? Colors.greenAccent : Colors.white38;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: isActive
            ? Colors.greenAccent.withValues(alpha: 0.1)
            : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive
              ? Colors.greenAccent.withValues(alpha: 0.3)
              : Colors.white.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.icon, required this.color});

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TelemetryBadge extends StatelessWidget {
  const _TelemetryBadge({required this.status});

  final TelemetryDataStatus status;

  @override
  Widget build(BuildContext context) {
    late final String label;
    late final IconData icon;
    late final Color color;

    switch (status) {
      case TelemetryDataStatus.live:
        label = 'Live';
        icon = Icons.wifi_tethering;
        color = Colors.greenAccent;
        break;
      case TelemetryDataStatus.stale:
        label = 'Stale';
        icon = Icons.wifi_tethering_error_rounded;
        color = Colors.orangeAccent;
        break;
      case TelemetryDataStatus.noData:
        label = 'No Data';
        icon = Icons.wifi_off_rounded;
        color = Colors.white54;
        break;
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 12),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatLapDuration(Duration d) {
  final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  final hundredths = (d.inMilliseconds.remainder(1000) ~/ 10)
      .toString()
      .padLeft(2, '0');
  return '$minutes:$seconds.$hundredths';
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.title,
    required this.icon,
    required this.width,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      width: width,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.2),
                    blurRadius: 16,
                    spreadRadius: 0.5,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surface.withValues(
                            alpha: 0.5,
                          ),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.05),
                          ),
                        ),
                        child: Icon(
                          icon,
                          color: theme.colorScheme.primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SystemStatusCard extends StatelessWidget {
  const _SystemStatusCard({required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.32),
                blurRadius: 24,
                spreadRadius: 0.5,
                offset: const Offset(0, 12),
              ),
              BoxShadow(
                color: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.07),
                blurRadius: 20,
                spreadRadius: -2,
                offset: const Offset(0, 5),
              ),
            ],
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Theme.of(context).colorScheme.surface.withValues(alpha: 0.42),
                Theme.of(context).colorScheme.surface.withValues(alpha: 0.24),
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).colorScheme.primary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.hub_outlined,
                      color: Theme.of(context).colorScheme.primary,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Connectivity',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Container(height: 1, color: Colors.white.withValues(alpha: 0.05)),
              const SizedBox(height: 20),
              _StatusRow(
                name: 'ELM327 OBD-II',
                isConnected: controller.isElm327Connected,
                hz: controller.elm327Hz,
                details: controller.isElm327Connected
                    ? 'Active · High-Speed CAN'
                    : 'Disconnected',
              ),
              const SizedBox(height: 16),
              _StatusRow(
                name: 'ESP32 SENSORS',
                isConnected: controller.isEsp32Connected,
                hz: controller.esp32Hz,
                details: controller.isEsp32Connected
                    ? 'Active · 6-Axis IMU'
                    : 'Disconnected',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.name,
    required this.isConnected,
    required this.details,
    this.hz = 0,
  });

  final String name;
  final bool isConnected;
  final String details;
  final double hz;

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    IconData statusIcon;

    if (isConnected) {
      statusColor = Colors.green;
      statusIcon = Icons.check_circle;
    } else {
      statusColor = Colors.grey;
      statusIcon = Icons.cancel;
    }

    // Hz Data Quality Color
    Color hzColor = Colors.grey;
    if (hz > 0) {
      // Different targets for different devices
      if (name.contains('ESP32')) {
        // Target 200Hz
        if (hz > 150)
          hzColor = Colors.green;
        else if (hz > 50)
          hzColor = Colors.orange;
        else
          hzColor = Colors.red;
      } else {
        // ELM327 Target >30Hz
        if (hz > 20)
          hzColor = Colors.green;
        else if (hz > 10)
          hzColor = Colors.orange;
        else
          hzColor = Colors.red;
      }
    }

    return Row(
      children: [
        Icon(statusIcon, color: statusColor, size: 24),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                details,
                style: TextStyle(
                  color: isConnected ? Colors.green.shade700 : Colors.grey,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (isConnected)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.green.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                if (hz > 0) ...[
                  Text(
                    '${hz.toStringAsFixed(0)} Hz',
                    style: TextStyle(
                      color: hzColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      fontFamily: 'Courier', // Monospace for tech feel
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 1,
                    height: 12,
                    color: Colors.grey.withOpacity(0.3),
                  ),
                  const SizedBox(width: 8),
                ],
                const Text(
                  'LIVE',
                  style: TextStyle(
                    color: Colors.green,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.22),
                blurRadius: 14,
                spreadRadius: 0,
                offset: const Offset(0, 8),
              ),
            ],
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Theme.of(context).colorScheme.surface.withValues(alpha: 0.26),
                Theme.of(context).colorScheme.surface.withValues(alpha: 0.14),
              ],
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline_rounded, size: 16, color: Colors.white54),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.white70,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
