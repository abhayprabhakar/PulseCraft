import re
fp = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\ride_summary\ride_summary_screen.dart'
with open(fp, 'r', encoding='utf-8') as f:
    s = f.read()

# Fix Polyline syntax
s = s.replace(
"""                                PolylineLayer(
                                  polylines: [
                                    Polyline(
                                      points: routePoints,
                                      color: Theme.of(context).colorScheme.primary,
                                      strokeWidth: 4.0,
                                      isDotted: false,
                                    ),
                                  ],
                                ),""", 
"""                                PolylineLayer(
                                  polylines: <Polyline<Object>>[
                                    Polyline<Object>(
                                      points: routePoints,
                                      color: Theme.of(context).colorScheme.primary,
                                      strokeWidth: 4.0,
                                    ),
                                  ],
                                ),""")


_SYNC_STAT = """class _SyncStatCounter extends StatelessWidget {
  const _SyncStatCounter({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value.toString(),
          style: TextStyle(
            color: color,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: color.withOpacity(0.8),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
"""

if "_SyncStatCounter" not in s:
    # insert before _Pill if _Pill exists, otherwise at end
    if "class _Pill" in s:
        s = s.replace("class _Pill", _SYNC_STAT + "\nclass _Pill")
    else:
        s = s + "\n" + _SYNC_STAT

with open(fp, 'w', encoding='utf-8') as f:
    f.write(s)
print("Fixes applied.")
