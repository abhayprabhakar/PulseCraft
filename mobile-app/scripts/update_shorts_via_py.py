import re

f = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\dashboard\dashboard_screen.dart'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace layout builder part
layout_old = r"(?s)(Text\(\s*'Shortcuts'.*?\)\s*,\s*const SizedBox\(height:\s*16\)\s*,\s*LayoutBuilder\(.*?\)\s*,)"

layout_new = """Padding(
                      padding: const EdgeInsets.only(left: 4, bottom: 12),
                      child: Text(
                        'Shortcuts',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                      ),
                    ),
                    Column(
                      children: [
                        _QuickActionCard(
                          title: 'Racing telemetry',
                          subtitle: 'Real-time performance metrics',
                          icon: Icons.speed,
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const FullScreenDashboardScreen(),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 12),
                        _QuickActionCard(
                          title: 'Add Location',
                          subtitle: 'Save point of interest',
                          icon: Icons.add_location_alt,
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const LocationPickerScreen(),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 12),
                        _QuickActionCard(
                          title: 'Manage bikes',
                          subtitle: 'Configure your garage',
                          icon: Icons.directions_bike,
                          onTap: () => Navigator.pushNamed(context, '/bikes'),
                        ),
                      ],
                    ),"""

content = re.sub(layout_old, layout_new, content)

card_old = r"(?s)(class _QuickActionCard extends StatelessWidget \{.*?\n\})"
card_new = """class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.2),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Colors.white.withOpacity(0.08),
              width: 1,
            ),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              splashColor: theme.colorScheme.primary.withOpacity(0.2),
              highlightColor: Colors.transparent,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withOpacity(0.1),
                        ),
                      ),
                      child: Icon(
                        icon,
                        color: Colors.white,
                        size: 26,
                      ),
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            subtitle,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withOpacity(0.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_ios,
                      color: Colors.white.withOpacity(0.3),
                      size: 18,
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
}"""

# Need to replace the final matching block for _QuickActionCard
content = re.sub(card_old, card_new, content, count=1)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)
print("Done")