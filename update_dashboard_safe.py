import os

fp = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\dashboard\dashboard_screen.dart'
with open(fp, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Ensure dart:ui is available
has_ui = any('dart:ui' in l for l in lines)
if not has_ui:
    for i, l in enumerate(lines):
        if l.startswith("import 'package:flutter/material.dart';"):
            lines.insert(i, "import 'dart:ui';\n")
            break

def get_class_bounds(class_name):
    start = -1
    for i, l in enumerate(lines):
        if l.startswith(f'class {class_name} extends'):
            start = i
            break
    if start == -1: return -1, -1
    end = -1
    brace_count = 0
    for i in range(start, len(lines)):
        brace_count += lines[i].count('{')
        brace_count -= lines[i].count('}')
        if brace_count == 0 and '{' in ''.join(lines[start:i+1]):
            end = i
            break
    return start, end

# Replacements
new_hero = """class _HeroCard extends StatelessWidget {
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
}
"""

new_quick_action = """class _QuickActionCard extends StatelessWidget {
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
}
"""

new_sys_card = """class _SystemStatusCard extends StatelessWidget {
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
}
"""

new_telemetry = """class _TelemetryBadge extends StatelessWidget {
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
}
"""

def replace_class(class_name, new_code):
    start, end = get_class_bounds(class_name)
    if start != -1 and end != -1:
        lines[start:end+1] = [new_code + '\n']

replace_class('_HeroCard', new_hero)
replace_class('_QuickActionCard', new_quick_action)
replace_class('_SystemStatusCard', new_sys_card)
replace_class('_TelemetryBadge', new_telemetry)

with open(fp, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Dashboard Glassmorphic Update successfully injected!")
