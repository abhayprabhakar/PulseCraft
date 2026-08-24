import ast
import json

with open(r"c:\Users\abhay\Documents\VSCode\Major Project\backend\app\routers\rides.py", "r", encoding="utf-8") as f:
    code = f.read()

tree = ast.parse(code)
routes = []
for node in ast.walk(tree):
    if isinstance(node, ast.FunctionDef):
        for desc in node.decorator_list:
            if isinstance(desc, ast.Call):
                if isinstance(desc.func, ast.Attribute) and desc.func.attr == 'post':
                    args = [a.value for a in desc.args if isinstance(a, ast.Constant)]
                    if args and 'chat' in args[0]:
                        routes.append((node.name, args[0], node.lineno))
                        
print(json.dumps(routes, indent=2))
