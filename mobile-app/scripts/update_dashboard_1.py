import re

file_path = r'c:\Users\abhay\Documents\VSCode\Major Project\pulsecraft-bike\mobile_app\pulsecraft_app\lib\features\dashboard\dashboard_screen.dart'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update blur container under the Stack
content = re.sub(
    r'filter: ImageFilter\.blur\(sigmaX: 80,\s*sigmaY: 80\),\s*child: Container\(color: Colors\.black\.withValues\(alpha: 0\.2\)\),',
    r'filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),\n                  child: const SizedBox(),',
    content
)

# 2. Match profile background circle colors and positions
content = re.sub(
    r'Positioned\(\s*bottom: -20,\s*left: -60,\s*child: Container\(\s*width: 250,\s*height: 250,\s*decoration: BoxDecoration\(\s*shape: BoxShape\.circle,\s*color: Colors\.deepPurpleAccent\.withValues\(alpha: 0\.18\),\s*\),\s*\),\s*\),',
    r'Positioned(\n                bottom: 100,\n                left: -100,\n                child: Container(\n                  width: 300,\n                  height: 300,\n                  decoration: BoxDecoration(\n                    shape: BoxShape.circle,\n                    color: Colors.purpleAccent.withValues(alpha: 0.15),\n                  ),\n                ),\n              ),',
    content
)

content = re.sub(
    r'Positioned\(\s*top: -50,\s*right: -100,\s*child: Container\(\s*width: 300,\s*height: 300,\s*decoration: BoxDecoration\(\s*shape: BoxShape\.circle,\s*color: Theme\.of\(\s*context,\s*\)\.colorScheme\.primary\.withValues\(alpha: 0\.20\),\s*\),\s*\),\s*\),',
    r'Positioned(\n                top: -50,\n                right: -50,\n                child: Container(\n                  width: 300,\n                  height: 300,\n                  decoration: BoxDecoration(\n                    shape: BoxShape.circle,\n                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),\n                  ),\n                ),\n              ),',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
