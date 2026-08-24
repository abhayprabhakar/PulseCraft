fp = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\ride_summary\ride_summary_screen.dart'
with open(fp, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, l in enumerate(lines):
    if 'class _RideCard ' in l: start = i
    if 'class _Pill ' in l:
        if end == -1: end = i

# Drop the existing _RideCard
before = lines[:start]
after = lines[end:]

new_ride_card = """class _RideCard extends StatelessWidget {
  const _RideCard({
    required this.summary,
    required this.routePoints,
    required this.durationText,
    required this.isSynced,
    required this.onTap,
  });

  final RideSummary summary;
  final List<LatLng> routePoints;
  final String durationText;
  final bool isSynced;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasRoute = routePoints.length >= 2;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface.withOpacity(0.35),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: Colors.white.withOpacity(0.06),
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.3),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                )
              ],
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // --- MAP HEADER ---
                    SizedBox(
                      height: 180,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (hasRoute)
                            FlutterMap(
                              options: MapOptions(
                                initialCameraFit: CameraFit.coordinates(
                                  coordinates: routePoints,
                                  padding: const EdgeInsets.all(32),
                                ),
                                interactionOptions: const InteractionOptions(
                                  flags: InteractiveFlag.none,
                                ),
                              ),
                              children: [
                                TileLayer(
                                  urlTemplate:
                                      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                                  subdomains: const ['a', 'b', 'c', 'd'],
                                ),
                                PolylineLayer(
                                  polylines: [
                                    Polyline(
                                      points: routePoints,
                                      color: Theme.of(context).colorScheme.primary,
                                      strokeWidth: 4.0,
                                      isDotted: false,
                                    ),
                                  ],
                                ),
                                MarkerLayer(
                                  markers: [
                                    // Start point
                                    Marker(
                                      point: routePoints.first,
                                      width: 12,
                                      height: 12,
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          shape: BoxShape.circle,
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.white.withOpacity(0.6),
                                              blurRadius: 6,
                                            )
                                          ],
                                          border: Border.all(
                                            color: Colors.black54,
                                            width: 2,
                                          ),
                                        ),
                                      ),
                                    ),
                                    // End point
                                    Marker(
                                      point: routePoints.last,
                                      width: 24,
                                      height: 24,
                                      child: Icon(
                                        Icons.location_on,
                                        color: Theme.of(context).colorScheme.primary,
                                        size: 24,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            )
                          else
                            Container(
                              color: Colors.black26,
                              child: const Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.satellite_alt, color: Colors.white24, size: 36),
                                    SizedBox(height: 8),
                                    Text(
                                      'AWAITING GPS DATA',
                                      style: TextStyle(
                                        color: Colors.white30,
                                        fontSize: 10,
                                        letterSpacing: 2,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            
                          // Elegant subtle vignette gradient over map
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.black.withOpacity(0.3),
                                    Colors.transparent,
                                    Theme.of(context).colorScheme.surface.withOpacity(0.9),
                                  ],
                                  stops: const [0.0, 0.4, 1.0],
                                ),
                              ),
                            ),
                          ),
                          
                          // Top Right: Duration Pill
                          Positioned(
                            top: 14,
                            right: 14,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(20),
                              child: BackdropFilter(
                                filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.4),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: Colors.white.withOpacity(0.15),
                                      width: 0.5,
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.timer_outlined,
                                        size: 12,
                                        color: Theme.of(context).colorScheme.primary,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        durationText,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                    // --- BODY INFO & STATS ---
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Title & Date Row
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      summary.title ?? 'Recent Ride',
                                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -0.3,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${summary.startedAt.toLocal()}'.split('.').first,
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.5),
                                        fontSize: 12,
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              // Sync Status
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: isSynced 
                                    ? Colors.greenAccent.withOpacity(0.1) 
                                    : Colors.white.withOpacity(0.05),
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  isSynced ? Icons.cloud_done : Icons.cloud_off,
                                  size: 16,
                                  color: isSynced ? Colors.greenAccent : Colors.white38,
                                ),
                              ),
                            ],
                          ),
                          
                          const SizedBox(height: 20),
                          
                          // Statistics Row
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.25),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: Colors.white.withOpacity(0.04),
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                _buildPremiumStat(
                                  context,
                                  Icons.speed,
                                  'Top Speed',
                                  summary.maxSpeed != null && summary.maxSpeed! > 0
                                      ? '${summary.maxSpeed!.toStringAsFixed(0)}'
                                      : '--',
                                  'km/h',
                                ),
                                Container(
                                  width: 1,
                                  height: 32,
                                  color: Colors.white.withOpacity(0.1),
                                ),
                                _buildPremiumStat(
                                  context,
                                  Icons.social_distance,
                                  'Distance',
                                  summary.totalDistanceKm > 0
                                      ? summary.totalDistanceKm.toStringAsFixed(1)
                                      : '--',
                                  'km',
                                ),
                                Container(
                                  width: 1,
                                  height: 32,
                                  color: Colors.white.withOpacity(0.1),
                                ),
                                _buildPremiumStat(
                                  context,
                                  Icons.query_stats,
                                  'Avg Speed',
                                  summary.avgSpeed != null && summary.avgSpeed! > 0
                                      ? '${summary.avgSpeed!.toStringAsFixed(0)}'
                                      : '--',
                                  'km/h',
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPremiumStat(
      BuildContext context, IconData icon, String label, String value, String unit) {
    return Expanded(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 12, color: Colors.white54),
              const SizedBox(width: 4),
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(width: 2),
              Text(
                unit,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
"""

all_lines = before + [new_ride_card] + after
with open(fp, 'w', encoding='utf-8') as f:
    f.writelines(all_lines)
print("Updated successfully!")
