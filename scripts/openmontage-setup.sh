#!/usr/bin/env bash
# Set up OpenMontage (https://github.com/calesthio/OpenMontage, AGPLv3) for making themed videos
# from this repo's cloud sessions. It lives in .openmontage/ (git-ignored) and is never committed.
#
# Usage:  bash scripts/openmontage-setup.sh
# Then:   put GOOGLE_API_KEY in the environment (cloud environment settings), and ask Claude to
#         make a video with OpenMontage.
#
# Besides `make setup`, this applies three fixes needed in a sandbox with a TLS-inspecting proxy:
#   1. Remotion would download its own Chrome from remotion.media (blocked) → use the preinstalled
#      Playwright headless shell instead (remotion.config.ts).
#   2. That browser does not trust the proxy CA, so Google Fonts fail → download the fonts with
#      Python (which does trust it) and point @remotion/google-fonts at the local copies.
#   3. Clear the webpack bundle cache so the patched font modules are picked up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OM="$ROOT/.openmontage"

if [ ! -d "$OM/.git" ]; then
  git clone --depth 1 https://github.com/calesthio/OpenMontage.git "$OM"
fi
cd "$OM"
make setup

# 1. Use a local headless browser for Remotion renders.
BROWSER="${REMOTION_BROWSER:-$(ls /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell 2>/dev/null | head -1 || true)}"
if [ -n "$BROWSER" ]; then
  cat > remotion-composer/remotion.config.ts <<EOF
import { Config } from "@remotion/cli/config";
Config.setBrowserExecutable("$BROWSER");
EOF
  # Local-only file: keep it out of OpenMontage's git status without touching their .gitignore.
  grep -qx "remotion-composer/remotion.config.ts" .git/info/exclude 2>/dev/null \
    || echo "remotion-composer/remotion.config.ts" >> .git/info/exclude
  echo "==> Remotion will use $BROWSER"
fi

# 2. Serve Google Fonts used by the composer from public/gfonts.
cd remotion-composer
../.venv/bin/python - <<'EOF'
import concurrent.futures as cf, pathlib, re, urllib.request
mods = sorted({m for f in pathlib.Path("src").rglob("*.tsx")
               for m in re.findall(r'@remotion/google-fonts/(\w+)', f.read_text())})
files = [p for m in mods for p in (pathlib.Path(f"node_modules/@remotion/google-fonts/dist/esm/{m}.mjs"),
                                     pathlib.Path(f"node_modules/@remotion/google-fonts/dist/cjs/{m}.js")) if p.exists()]
urls = {u for f in files for u in re.findall(r'https://fonts\.gstatic\.com/s/[^"\']+', f.read_text())}
out = pathlib.Path("public/gfonts")
def get(u):
    dst = out / u.split("/s/", 1)[1]
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(urllib.request.urlopen(u, timeout=30).read())
with cf.ThreadPoolExecutor(8) as ex:
    list(ex.map(get, urls))
for f in files:
    f.write_text(f.read_text().replace('"https://fonts.gstatic.com/s/', 'window.remotion_staticBase + "/gfonts/'))
print(f"==> Localized {len(urls)} font files for {', '.join(mods)}")
EOF

# 3. Drop the bundle cache so the patched modules are used.
rm -rf node_modules/.cache
echo "==> OpenMontage ready in $OM"
[ -n "${GOOGLE_API_KEY:-}${GEMINI_API_KEY:-}" ] && echo "==> Google API key found" || echo "==> No GOOGLE_API_KEY yet — add it in the cloud environment settings"
