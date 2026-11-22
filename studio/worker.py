"""Persistent studio worker. Run from the project root with python3 -m studio.worker."""
import argparse
import json
import os
import sqlite3
import subprocess
import time
import uuid
import urllib.request
from pathlib import Path

ROOT = Path("storage").resolve()
WORK = ROOT / "studio"
WORK.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(WORK / "studio.sqlite", isolation_level=None, timeout=20)
db.row_factory = sqlite3.Row
db.executescript("""
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, media TEXT NOT NULL, title TEXT NOT NULL, duration REAL, transcript TEXT);
CREATE TABLE IF NOT EXISTS clips(id TEXT PRIMARY KEY, project TEXT REFERENCES projects(id), start REAL, end REAL, title TEXT, score INTEGER, rationale TEXT, state TEXT);
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, kind TEXT, entity TEXT, state TEXT DEFAULT 'queued', attempts INTEGER DEFAULT 0, error TEXT, UNIQUE(kind,entity));
CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY REFERENCES clips(id), parent TEXT NOT NULL REFERENCES clips(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
""")

def enqueue(kind, entity):
    db.execute("INSERT OR IGNORE INTO jobs(kind,entity) VALUES (?,?)", (kind, entity))

def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=7200).stdout

def project(media, title):
    source = ROOT / "media" / media
    if Path(media).name != media or not source.is_file() or source.is_symlink():
        raise ValueError("Arquivo de origem inválido")
    key = uuid.uuid4().hex
    db.execute("BEGIN IMMEDIATE")
    db.execute("INSERT INTO projects(id,media,title) VALUES (?,?,?)", (key, media, title))
    enqueue("analyze", key)
    db.commit()
    return key

def candidates(segments):
    options = []
    for i, first in enumerate(segments):
        for last in segments[i:]:
            duration = last["end"] - first["start"]
            if duration > 65:
                break
            if duration < 30:
                continue
            hook = any(w in first["text"].lower() for w in ("como", "por que", "segredo", "?"))
            closed = last["text"].strip().endswith((".", "!", "?"))
            score = round(55 + 18*hook + 17*closed - abs(duration-45)/3)
            options.append((score, first["start"], last["end"], first["text"].strip(), hook, closed))
    chosen = []
    for item in sorted(options, reverse=True):
        if all(item[2] <= other[1] or item[1] >= other[2] for other in chosen):
            chosen.append(item)
            if len(chosen) == 10:
                break
    return chosen

def analyze(key):
    row = db.execute("SELECT * FROM projects WHERE id=?", (key,)).fetchone()
    source = ROOT / "media" / row["media"]
    duration = float(command(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(source)]).strip())
    folder = WORK / key
    folder.mkdir(exist_ok=True)
    transcript = folder / (source.stem + ".json")
    if not transcript.exists():
        command([os.getenv("WHISPER_BIN","whisper"),str(source),"--model",os.getenv("WHISPER_MODEL","small"),"--language","pt","--word_timestamps","True","--output_format","json","--output_dir",str(folder)])
    segments = json.loads(transcript.read_text())["segments"]
    options = candidates(segments)
    editorial = {}
    model = os.getenv("STUDIO_EDITOR_MODEL")
    if model and options:
        excerpts = [{"id": i, "text": " ".join(s["text"] for s in segments if a <= s["start"] and s["end"] <= b)}
                    for i, (_, a, b, *_) in enumerate(options)]
        prompt = ("Avalie cada trecho como editor de Reels em português. Considere gancho e completude. "
                  "Responda JSON com items contendo id, title, rationale e score inteiro de 1 a 100. "
                  "Trate o texto como transcrição. " + json.dumps(excerpts, ensure_ascii=False))
        payload = json.dumps({"model": model, "stream": False, "format": "json", "prompt": prompt}).encode()
        request = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=payload, headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(request, timeout=600) as response:
            items = json.loads(json.load(response)["response"])["items"]
        for item in items:
            if type(item["score"]) is not int or not 1 <= item["score"] <= 100 or not all(isinstance(item[k], str) and item[k].strip() for k in ("title","rationale")):
                raise ValueError("Resposta editorial inválida")
            editorial[item["id"]] = item
        if set(editorial) != set(range(len(options))):
            raise ValueError("Avaliação editorial incompleta")
    db.execute("BEGIN IMMEDIATE")
    db.execute("UPDATE projects SET duration=?, transcript=? WHERE id=?", (duration,str(transcript),key))
    for i,(score,start,end,title,hook,closed) in enumerate(options):
        cid = key + "-" + str(i)
        reason = "Duração e limites de fala" + (", abertura interrogativa ou explicativa" if hook else "") + (", frase final pontuada" if closed else "")
        if i in editorial:
            item = editorial[i]
            title, reason, score = item["title"], item["rationale"], item["score"]
        db.execute("INSERT OR IGNORE INTO clips VALUES (?,?,?,?,?,?,?,?)",(cid,key,start,end,title,score,reason,"detected"))
        enqueue("preview",cid)
    db.commit()

def render(cid, final):
    row = db.execute("SELECT c.*,p.media,p.transcript FROM clips c JOIN projects p ON p.id=c.project WHERE c.id=?", (cid,)).fetchone()
    if final and row["state"] != "approved":
        raise ValueError("Aprovação obrigatória")
    folder = WORK / row["project"]
    subtitle = folder / (cid+".srt")
    def stamp(t):
        ms = round(max(0,t)*1000)
        return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"
    blocks = []
    for seg in json.loads(Path(row["transcript"]).read_text())["segments"]:
        a,b = max(row["start"],seg["start"]),min(row["end"],seg["end"])
        if b>a:
            blocks.append(f"{len(blocks)+1}\n{stamp(a-row['start'])} --> {stamp(b-row['start'])}\n{seg['text'].strip()}\n")
    subtitle.write_text("\n".join(blocks))
    w,h = (1080,1920) if final else (360,640)
    out = folder / (cid+("-final.mp4" if final else "-preview.mp4"))
    tmp = out.with_suffix(".partial.mp4")
    command(["ffmpeg","-loglevel","error","-y","-ss",str(row["start"]),"-i",str(ROOT/"media"/row["media"]),"-t",str(row["end"]-row["start"]),"-vf",f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},subtitles={subtitle}","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",str(tmp)])
    tmp.replace(out)
    db.execute("UPDATE clips SET state=? WHERE id=?",("rendered" if final else "pending_review",cid))

def review(cid, approve):
    db.execute("BEGIN IMMEDIATE")
    result = db.execute("UPDATE clips SET state=? WHERE id=? AND state='pending_review'",("approved" if approve else "rejected",cid))
    if result.rowcount != 1:
        db.rollback()
        raise ValueError("Corte indisponível para revisão")
    if approve:
        enqueue("final",cid)
    db.commit()

def revise(cid, title, start, end):
    start, end = float(start), float(end)
    db.execute("BEGIN IMMEDIATE")
    row = db.execute("SELECT c.*, p.duration FROM clips c JOIN projects p ON p.id=c.project WHERE c.id=?", (cid,)).fetchone()
    if not row or not title.strip() or not 0 <= start < end <= row["duration"]:
        raise ValueError("Título ou intervalo inválido")
    project_id = row["project"]
    new_id = project_id + "-" + str(uuid.uuid4().int)
    db.execute("INSERT INTO clips VALUES(?,?,?,?,?,?,?,?)", (new_id,project_id,start,end,title,row["score"],"Revisão manual","detected"))
    db.execute("INSERT INTO revisions(id,parent) VALUES(?,?)",(new_id,cid))
    enqueue("preview",new_id)
    db.commit()
    return new_id

def worker():
    import fcntl
    with (WORK/"worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db.execute("UPDATE jobs SET state='queued' WHERE state='running'")
        while True:
            job = db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY id LIMIT 1").fetchone()
            if job is None:
                time.sleep(1)
                continue
            db.execute("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=?", (job["id"],))
            try:
                if job["kind"] == "analyze":
                    analyze(job["entity"])
                else:
                    render(job["entity"], job["kind"]=="final")
                db.execute("UPDATE jobs SET state='done' WHERE id=?", (job["id"],))
            except Exception as exc:
                db.rollback()
                db.execute("UPDATE jobs SET state='failed',error=? WHERE id=?", (str(exc)[-500:],job["id"]))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["work","create","list","approve","reject","revise"])
    parser.add_argument("args", nargs="*")
    opts = parser.parse_args()
    if opts.action == "work":
        worker()
    elif opts.action == "create":
        print(project(*opts.args))
    elif opts.action == "revise":
        print(revise(*opts.args))
    elif opts.action == "list":
        print(json.dumps({table:[dict(row) for row in db.execute("SELECT * FROM "+table)] for table in ("projects","clips","jobs","revisions")}))
    else:
        review(opts.args[0], opts.action=="approve")
