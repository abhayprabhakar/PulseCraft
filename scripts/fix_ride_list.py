fp = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\ride_summary\ride_summary_screen.dart'
with open(fp, encoding='utf-8') as f:
    s = f.read()

# 1. Convert RideSummaryScreen to StatefulWidget and add _isTileView state
CLASS_DEF = "class RideSummaryScreen extends StatelessWidget {\n  const RideSummaryScreen({super.key});\n\n  @override\n  Widget build(BuildContext context) {"
NEW_CLASS_DEF = """class RideSummaryScreen extends StatefulWidget {
  const RideSummaryScreen({super.key});

  @override
  State<RideSummaryScreen> createState() => _RideSummaryScreenState();
}

class _RideSummaryScreenState extends State<RideSummaryScreen> {
  bool _isTileView = true;

  @override
  Widget build(BuildContext context) {"""
s = s.replace(CLASS_DEF, NEW_CLASS_DEF, 1)


# 2. Add the toggle icon button next to the cloud sync button
HEADER_ROW = """                              children: [
                                Text(
                                  'Ride Summary',
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1.2,
                                      ),
                                ),
                                IconButton(
                                  icon: Icon("""
NEW_HEADER_ROW = """                              children: [
                                Text(
                                  'Ride Summary',
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1.2,
                                      ),
                                ),
                                Row(
                                  children: [
                                    IconButton(
                                      icon: Icon(
                                        _isTileView
                                            ? Icons.view_list_rounded
                                            : Icons.grid_view_rounded,
                                        color: Colors.white,
                                      ),
                                      tooltip: _isTileView ? 'List View' : 'Card View',
                                      onPressed: () {
                                        setState(() {
                                          _isTileView = !_isTileView;
                                        });
                                      },
                                    ),
                                    IconButton(
                                      icon: Icon("""
s = s.replace(HEADER_ROW, NEW_HEADER_ROW, 1)

# close the extra Row ] we opened
SYNC_BTN_END = """                                ),
                              ],
                            ),"""
NEW_SYNC_BTN_END = """                                ),
                                  ],
                                ),
                              ],
                            ),"""
s = s.replace(SYNC_BTN_END, NEW_SYNC_BTN_END, 1)


# 3. Swap the render for _RideCard
RENDERING = """                        return _RideCard(
                          summary: r,
                          routePoints: routePoints,
                          durationText: durationText,
                          isSynced: r.isSyncedFor(c.currentUser?.id),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => TripDetailScreen(summary: r),
                            ),
                          ),
                        );"""
NEW_RENDERING = """                        if (_isTileView) {
                          return _RideCard(
                            summary: r,
                            routePoints: routePoints,
                            durationText: durationText,
                            isSynced: r.isSyncedFor(c.currentUser?.id),
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => TripDetailScreen(summary: r),
                              ),
                            ),
                          );
                        } else {
                          return _RideListTile(
                            summary: r,
                            durationText: durationText,
                            isSynced: r.isSyncedFor(c.currentUser?.id),
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => TripDetailScreen(summary: r),
                              ),
                            ),
                          );
                        }"""
s = s.replace(RENDERING, NEW_RENDERING, 1)


# 4. Add _RideListTile component at the bottom of the file
# Right before the last closing stuff or just at the end.
RIDE_LIST_TILE = """
class _RideListTile extends StatelessWidget {
  const _RideListTile({
    required this.summary,
    required this.durationText,
    required this.isSynced,
    required this.onTap,
  });

  final RideSummary summary;
  final String durationText;
  final bool isSynced;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withOpacity(0.4),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.white.withOpacity(0.08),
              width: 1,
            ),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.route,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            summary.title ??
                                '${summary.startedAt.toLocal()}'.split('.').first,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                        ),
                        Icon(
                          isSynced ? Icons.cloud_done : Icons.cloud_off,
                          size: 16,
                          color: isSynced
                              ? Colors.green
                              : Colors.grey.withOpacity(0.5),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Theme.of(context)
                                .colorScheme
                                .primary
                                .withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withOpacity(0.3),
                            ),
                          ),
                          child: Text(
                            durationText,
                            style: Theme.of(context)
                                .textTheme
                                .labelMedium
                                ?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          vertical: 16, horizontal: 12),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.05),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildStatForList(
                            context,
                            icon: Icons.speed,
                            label: 'Max Speed',
                            value: (summary.maxSpeed ?? 0) > 0
                                ? '${summary.maxSpeed!.toStringAsFixed(0)} km/h'
                                : '--',
                          ),
                          Container(
                            height: 40,
                            width: 1,
                            color: Colors.white.withOpacity(0.1),
                          ),
                          _buildStatForList(
                            context,
                            icon: Icons.map,
                            label: 'Distance',
                            value: summary.totalDistanceKm > 0
                                ? '${summary.totalDistanceKm.toStringAsFixed(1)} km'
                                : '--',
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

  Widget _buildStatForList(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: Colors.grey),
            const SizedBox(width: 4),
            Text(
              label,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }
}
"""
s += RIDE_LIST_TILE

with open(fp, 'w', encoding='utf-8') as f:
    f.write(s)
print("Done")
