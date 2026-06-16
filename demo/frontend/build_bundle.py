"""Concatenate src/*.jsx into src/bundle.jsx in dependency order.
Run this after editing any source file:  python build_bundle.py
"""
ORDER = [
    "util", "realdata", "icons", "charts", "chrome",
    "screen-login", "screen-dashboard", "screen-livedetect",
    "screen-traffic", "screen-threats", "screen-ml", "screen-shap",
    "screen-intel", "screen-api", "app",
]

parts = []
for name in ORDER:
    with open(f"src/{name}.jsx", encoding="utf-8") as f:
        parts.append(f"// ===== {name}.jsx =====\n" + f.read())

with open("src/bundle.jsx", "w", encoding="utf-8") as f:
    f.write("\n\n".join(parts))

print(f"bundle.jsx written from {len(ORDER)} files")
