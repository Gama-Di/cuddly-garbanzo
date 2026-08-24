#!/usr/bin/env python3
"""Build an itch.io-ready zip of Aether Arena.

  python3 tools/build-itch.py                    # offline demo build (Practice vs AI)
  python3 tools/build-itch.py https://your-host   # online build pointing at your server

Output: dist/aether-arena-itch.zip (HTML5 project; upload as 'Played in the browser').
"""
import os, re, shutil, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'dist', 'itch')
STAGE = os.path.join(OUT_DIR, 'aether-arena')

server = sys.argv[1] if len(sys.argv) > 1 else ''
inject = ('<script>window.GAME_SERVER=%s;</script>' % ('"' + server.strip('/') + '"')) if server else '<script>window.OFFLINE_DEMO=true;</script>'

shutil.rmtree(OUT_DIR, ignore_errors=True)
os.makedirs(STAGE, exist_ok=True)

# copy client assets
for d in ['js', 'img', 'sfx']:
    shutil.copytree(os.path.join(ROOT, d), os.path.join(STAGE, d), ignore=shutil.ignore_patterns('*.py'))

html = open(os.path.join(ROOT, 'index.html')).read()
# inject config before first script; strip service-worker/manifest/PWA hints for the iframe build
html = html.replace('<script src="js/util.js', inject + '\n<script src="js/util.js', 1)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r"[^\n]*serviceWorker[\s\S]{0,120}?catch\(\(\) => \{\}\);", '', html, count=1)
open(os.path.join(STAGE, 'index.html'), 'w').write(html)

zpath = os.path.join(OUT_DIR, 'aether-arena-itch.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(STAGE):
        for f in files:
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, STAGE))
print('built:', zpath, '(%.1f MB)' % (os.path.getsize(zpath) / 1e6), '— mode:', 'ONLINE → ' + server if server else 'OFFLINE DEMO (Practice)')
