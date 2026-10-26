import os
import re

fp = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\dashboard\dashboard_screen.dart'
with open(fp, 'r', encoding='utf-8') as f:
    s = f.read()

# Add dart:ui import
if 'dart:ui' not in s:
    s = s.replace("import 'package:flutter/material.dart';", "import 'dart:ui';\nimport 'package:flutter/material.dart';")

# 1. Update _HeroCard
old_hero = r'''class _HeroCard extends StatelessWidget \{[\s\S]*?Widget build\(BuildContext context\) \{[\s\S]*?final bikeName = controller.currentBike\?.name \?\? 'Select a bike to start';[\s\S]*?final rideText = controller.isRideLogging[\s\S]*?'Ready when you are';[\s\S]*?return Card\([\s\S]*?elevation: 2,[\s\S]*?child: Container\([\s\S]*?decoration: BoxDecoration\([\s\S]*?borderRadius: BorderRadius.circular\(12\),[\s\S]*?gradient: LinearGradient\([\s\S]*?colors: \[[\s\S]*?theme.colorScheme.primaryContainer,[\s\S]*?theme.colorScheme.surface,[\s\S]*?\],[\s\S]*?begin: Alignment.topLeft,[\s\S]*?end: Alignment.bottomRight,[\s\S]*?\),[\s\S]*?\),[\s\S]*?padding: const EdgeInsets.all\(16\),[\s\S]*?child: Column\([\s\S]*?crossAxisAlignment: CrossAxisAlignment.start,[\s\S]*?children: \[[\s\S]*?Row\([\s\S]*?children: \[[\s\S]*?Container\([\s\S]*?padding: const EdgeInsets.all\(10\),[\s\S]*?decoration: BoxDecoration\([\s\S]*?color: theme.colorScheme.primary.withOpacity\(0.12\),[\s\S]*?shape: BoxShape.circle,[\s\S]*?\),[\s\S]*?child: Icon\(Icons.dashboard_customize,[\s\S]*?color: theme.colorScheme.primary, size: 20\),[\s\S]*?\),[\s\S]*?const SizedBox\(width: 12\),[\s\S]*?Text\([\s\S]*?'Dashboard',[\s\S]*?style: theme.textTheme.titleMedium\?.copyWith\([\s\S]*?fontWeight: FontWeight.w700,[\s\S]*?\),[\s\S]*?\),[\s\S]*?const Spacer\(\),[\s\S]*?_TelemetryBadge\(status: controller.telemetryDataStatus\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?const SizedBox\(height: 12\),[\s\S]*?Text\([\s\S]*?bikeName,[\s\S]*?style: theme.textTheme.headlineSmall\?.copyWith\([\s\S]*?fontWeight: FontWeight.bold,[\s\S]*?\),[\s\S]*?\),[\s\S]*?const SizedBox\(height: 4\),[\s\S]*?Text\([\s\S]*?rideText,[\s\S]*?style: theme.textTheme.bodyMedium,[\s\S]*?\),[\s\S]*?const SizedBox\(height: 16\),[\s\S]*?Row\([\s\S]*?children: \[[\s\S]*?_DevicePill\([\s\S]*?label: 'ESP32',[\s\S]*?isActive: controller.isEsp32Connected,[\s\S]*?\),[\s\S]*?const SizedBox\(width: 8\),[\s\S]*?_DevicePill\([\s\S]*?label: 'OBD-II',[\s\S]*?isActive: controller.isElm327Connected,[\s\S]*?\),[\s\S]*?const Spacer\(\),[\s\S]*?if \(controller.currentBike != null\)[\s\S]*?FilledButton.icon\([\s\S]*?onPressed: controller.isRideLogging \? onStop : onStart,[\s\S]*?icon: Icon\([\s\S]*?controller.isRideLogging \? Icons.stop : Icons.play_arrow,[\s\S]*?\),[\s\S]*?label: Text\(controller.isRideLogging \? 'Stop' : 'Start ride'\),[\s\S]*?style: FilledButton.styleFrom\([\s\S]*?backgroundColor: controller.isRideLogging[\s\S]*?\? Colors.red[\s\S]*?: theme.colorScheme.primary,[\s\S]*?foregroundColor: controller.isRideLogging[\s\S]*?\? Colors.white[\s\S]*?: theme.colorScheme.onPrimary,[\s\S]*?\),[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\),[\s\S]*?\);[\s\S]*?\}[\s\S]*?\}'''

new_hero = '''class _HeroCard extends StatelessWidget {
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
    final rideText = controller.isRideLogging
        ? 'Recording ride and sensors'
        : 'Ready when you are';

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 20,
                offset: const Offset(0, 10),
              )
            ],
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                theme.colorScheme.surface.withValues(alpha: 0.4),
                theme.colorScheme.surface.withValues(alpha: 0.1),
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: theme.colorScheme.primary.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Icon(Icons.dashboard_customize,
                        color: theme.colorScheme.primary, size: 20),
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
              Text(
                bikeName,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                rideText,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
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
                              horizontal: 20, vertical: 12),
                          decoration: BoxDecoration(
                            color: controller.isRideLogging
                                ? Colors.redAccent.withValues(alpha: 0.2)
                                : theme.colorScheme.primary.withValues(alpha: 0.9),
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
                                controller.isRideLogging ? 'Stop' : 'Start Ride',
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
        ),
      ),
    );
  }
}'''

# 2. Replace the shortcuts wrapper so we don't have Wrap constraints looking weird
old_shortcuts_label = r'''Text\(
                  'Shortcuts',
                  style: Theme.of\(context\).textTheme.titleMedium,
                \),'''
new_shortcuts_label = '''Text(
                  'Shortcuts',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),'''
                
old_quick_action = r'''class _QuickActionCard extends StatelessWidget \{[\s\S]*?Widget build\(BuildContext context\) \{[\s\S]*?final theme = Theme.of\(context\);[\s\S]*?return SizedBox\([\s\S]*?width: width,[\s\S]*?child: Card\([\s\S]*?elevation: 0,[\s\S]*?color: theme.colorScheme.surfaceVariant.withOpacity\(0.35\),[\s\S]*?child: InkWell\([\s\S]*?borderRadius: BorderRadius.circular\(12\),[\s\S]*?onTap: onTap,[\s\S]*?child: Padding\([\s\S]*?padding: const EdgeInsets.all\(16\),[\s\S]*?child: Row\([\s\S]*?crossAxisAlignment: CrossAxisAlignment.start,[\s\S]*?children: \[[\s\S]*?Container\([\s\S]*?padding: const EdgeInsets.all\(10\),[\s\S]*?decoration: BoxDecoration\([\s\S]*?color:[\s\S]*?theme.colorScheme.primaryContainer.withOpacity\(0.5\),[\s\S]*?borderRadius: BorderRadius.circular\(10\),[\s\S]*?\),[\s\S]*?child: Icon\(icon,[\s\S]*?color: theme.colorScheme.onPrimaryContainer, size: 20\),[\s\S]*?\),[\s\S]*?const SizedBox\(width: 10\),[\s\S]*?Expanded\([\s\S]*?child: Column\([\s\S]*?crossAxisAlignment: CrossAxisAlignment.start,[\s\S]*?children: \[[\s\S]*?Text\([\s\S]*?title,[\s\S]*?style: theme.textTheme.titleSmall\?.copyWith\([\s\S]*?fontWeight: FontWeight.w700,[\s\S]*?\),[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\),[\s\S]*?\),[\s\S]*?\),[\s\S]*?\);[\s\S]*?\}[\s\S]*?\}'''

new_quick_action = '''class _QuickActionCard extends StatelessWidget {
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
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.surface.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.05),
              ),
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
                          color: theme.colorScheme.surface.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.05),
                          ),
                        ),
                        child: Icon(icon,
                            color: theme.colorScheme.primary, size: 20),
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
}'''

old_sys_card = r'''class _SystemStatusCard extends StatelessWidget \{[\s\S]*?Widget build\(BuildContext context\) \{[\s\S]*?return Card\([\s\S]*?elevation: 2,[\s\S]*?child: Padding\([\s\S]*?padding: const EdgeInsets.all\(16\),[\s\S]*?child: Column\([\s\S]*?crossAxisAlignment: CrossAxisAlignment.start,[\s\S]*?children: \[[\s\S]*?Row\([\s\S]*?children: \[[\s\S]*?Icon\(Icons.hub, color: Theme.of\(context\).colorScheme.primary\),[\s\S]*?const SizedBox\(width: 8\),[\s\S]*?Text\([\s\S]*?'Connectivity',[\s\S]*?style: Theme.of\(context\).textTheme.titleMedium\?.copyWith\([\s\S]*?fontWeight: FontWeight.w700,[\s\S]*?color: Theme.of\(context\).colorScheme.primary,[\s\S]*?\),[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?const Divider\(height: 24\),[\s\S]*?_StatusRow\([\s\S]*?name: 'ELM327 OBD-II',[\s\S]*?isConnected: controller.isElm327Connected,[\s\S]*?hz: controller.elm327Hz,[\s\S]*?details: controller.isElm327Connected[\s\S]*?\? 'Active â€¢ High-Speed CAN'[\s\S]*?: 'Disconnected',[\s\S]*?\),[\s\S]*?const SizedBox\(height: 12\),[\s\S]*?_StatusRow\([\s\S]*?name: 'ESP32 SENSORS',[\s\S]*?isConnected: controller.isEsp32Connected,[\s\S]*?hz: controller.esp32Hz,[\s\S]*?details: controller.isEsp32Connected[\s\S]*?\? 'Active â€¢ 6-Axis IMU'[\s\S]*?: 'Disconnected',[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\),[\s\S]*?\);[\s\S]*?\}[\s\S]*?\}'''
old_sys_card = old_sys_card.replace('Active â€¢', 'Active.*')

new_sys_card = '''class _SystemStatusCard extends StatelessWidget {
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
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.05),
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
                      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.hub_outlined, color: Theme.of(context).colorScheme.primary, size: 20),
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
              Container(
                height: 1,
                color: Colors.white.withValues(alpha: 0.05),
              ),
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
}'''

old_telemetry = r'''class _TelemetryBadge extends StatelessWidget \{[\s\S]*?Widget build\(BuildContext context\) \{[\s\S]*?late final String label;[\s\S]*?late final IconData icon;[\s\S]*?late final Color color;[\s\S]*?switch \(status\) \{[\s\S]*?case TelemetryDataStatus.live:[\s\S]*?label = 'Live';[\s\S]*?icon = Icons.wifi_tethering;[\s\S]*?color = Colors.green;[\s\S]*?break;[\s\S]*?case TelemetryDataStatus.stale:[\s\S]*?label = 'Stale';[\s\S]*?icon = Icons.wifi_tethering_error_rounded;[\s\S]*?color = Colors.orange;[\s\S]*?break;[\s\S]*?case TelemetryDataStatus.none:[\s\S]*?label = 'No Data';[\s\S]*?icon = Icons.wifi_off_rounded;[\s\S]*?color = Colors.grey;[\s\S]*?break;[\s\S]*?\}[\s\S]*?return Container\([\s\S]*?padding: const EdgeInsets.symmetric\(horizontal: 10, vertical: 4\),[\s\S]*?decoration: BoxDecoration\([\s\S]*?color: color.withOpacity\(0.1\),[\s\S]*?borderRadius: BorderRadius.circular\(16\),[\s\S]*?border: Border.all\(color: color.withOpacity\(0.3\)\),[\s\S]*?\),[\s\S]*?child: Row\([\s\S]*?mainAxisSize: MainAxisSize.min,[\s\S]*?children: \[[\s\S]*?Icon\(icon, color: color, size: 14\),[\s\S]*?const SizedBox\(width: 6\),[\s\S]*?Text\([\s\S]*?label,[\s\S]*?style: TextStyle\([\s\S]*?color: color,[\s\S]*?fontSize: 12,[\s\S]*?fontWeight: FontWeight.bold,[\s\S]*?\),[\s\S]*?\),[\s\S]*?\],[\s\S]*?\),[\s\S]*?\);[\s\S]*?\}[\s\S]*?\}'''

new_telemetry = '''class _TelemetryBadge extends StatelessWidget {
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
      case TelemetryDataStatus.none:
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
}'''


import re
s = re.sub(old_hero, new_hero, s, flags=re.DOTALL)
s = re.sub(old_quick_action, new_quick_action, s, flags=re.DOTALL)
s = re.sub(old_sys_card, new_sys_card, s, flags=re.DOTALL)
s = re.sub(old_telemetry, new_telemetry, s, flags=re.DOTALL)
s = re.sub(old_shortcuts_label, new_shortcuts_label, s, flags=re.DOTALL)

with open(fp, 'w', encoding='utf-8') as f:
    f.write(s)
print("Dashboard Glassmorphic Update injected!")
