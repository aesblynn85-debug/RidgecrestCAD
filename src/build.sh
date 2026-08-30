#!/usr/bin/env bash
# Regenerates app.bundle.js from app.js + part2.js + part3.js.
# Run this after editing any of those three files, then commit app.bundle.js too —
# this is a plain static site (no build step on Vercel), so the bundle that ships
# is whatever's committed, not something built at deploy time.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'EOF'
app = open('app.js').read()
part2 = open('part2.js').read()
part3 = open('part3.js').read()
marker = 'document.addEventListener("DOMContentLoaded", init);\n})();'
assert marker in app, "marker not found in app.js — did the init()/IIFE-close lines change?"
splice = part2 + "\n" + part3 + "\n" + marker
combined = app.replace(marker, splice)
open('app.bundle.js', 'w').write(combined)
print("wrote src/app.bundle.js:", len(combined), "bytes")
EOF
