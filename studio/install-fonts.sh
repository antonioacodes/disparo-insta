#!/usr/bin/env bash
set -euo pipefail
apt-get install -y fontconfig fonts-dejavu-core fonts-liberation
python3 - <<'PY'
import json
import urllib.request
from pathlib import Path
folder = Path('/usr/local/share/fonts/disparo-studio')
folder.mkdir(parents=True,exist_ok=True)
for family in 'montserrat anton bebasneue oswald poppins robotocondensed barlowcondensed archivoblack dmsans spacegrotesk'.split():
    url = 'https://api.github.com/repos/google/fonts/contents/ofl/' + family
    for item in json.load(urllib.request.urlopen(url,timeout=30)):
        name = item['name']
        if name.endswith('.ttf') and 'Italic' not in name:
            data = urllib.request.urlopen(item['download_url'],timeout=60).read()
            (folder/name).write_bytes(data)
        if name=='OFL.txt':
            (folder/(family+'-OFL.txt')).write_bytes(urllib.request.urlopen(item['download_url'],timeout=30).read())
PY
fc-cache -f
