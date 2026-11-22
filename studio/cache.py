"""Retention and technical details for Studio projects."""
import json
import logging
import sqlite3
import subprocess
import time
from fractions import Fraction

RETENTION = 15 * 86400


def remove_preview(work, project, clip):
    for suffix in ("-preview.mp4", "-poster.jpg", "-poster.jpg.tmp.jpg"):
        (work / project / (clip + suffix)).unlink(missing_ok=True)


def technical_details(source):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                             "-of", "json", str(source)], capture_output=True, text=True,
                            check=True, timeout=30)
    info = json.loads(result.stdout)
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), {})
    rate = video.get("avg_frame_rate", "0/0")
    try:
        fps = round(float(Fraction(rate)), 2)
    except (ValueError, ZeroDivisionError):
        fps = None
    return dict(width=video.get("width"), height=video.get("height"), fps=fps,
                format=info["format"].get("format_name"), codec=video.get("codec_name"),
                language=audio.get("tags", {}).get("language"))


def maintain(work):
    conn = sqlite3.connect(work / "studio.sqlite", timeout=20, isolation_level=None)
    while True:
        try:
            for project, clip in conn.execute("""SELECT project,id FROM clips
                    WHERE state!='detected' AND id NOT IN (SELECT clip FROM preview_cache)"""):
                path = work / project / (clip + "-preview.mp4")
                deadline = path.stat().st_mtime + RETENTION if path.is_file() else 0
                conn.execute("INSERT OR IGNORE INTO preview_cache VALUES(?,?,?)",
                             (clip, deadline, int(not deadline)))
            for project, clip in conn.execute("""SELECT c.project,c.id FROM clips c JOIN preview_cache p
                    ON c.id=p.clip WHERE p.removed=0 AND p.expires<=?""", (time.time(),)):
                remove_preview(work, project, clip)
                conn.execute("UPDATE preview_cache SET removed=1 WHERE clip=?", (clip,))
            for project, media in conn.execute("SELECT id,media FROM projects WHERE id NOT IN (SELECT project FROM media_info)"):
                source = work.parent / "media" / media
                if source.is_file():
                    try:
                        details = technical_details(source)
                    except (OSError, subprocess.SubprocessError, ValueError):
                        logging.exception("Falha ao ler metadados de %s", media)
                        continue
                    conn.execute("INSERT OR REPLACE INTO media_info VALUES(?,?)", (project,json.dumps(details)))
        except (OSError, sqlite3.Error):
            logging.exception("Falha na manutenção das prévias")
        time.sleep(60)
