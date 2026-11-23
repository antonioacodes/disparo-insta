"""Read the editing queue without loading transcripts or running video work."""
import json
import statistics
import time

LABELS = {"import": "Importar vídeo", "analyze": "Analisar vídeo", "preview": "Gerar prévia",
          "final": "Exportar corte", "purge": "Limpar projeto"}


def agent_state(online, active, queued, failed):
    if not online:
        return "Processador offline"
    if active:
        return "Trabalhando"
    if queued:
        return "Esperando"
    return "Erro" if failed else "Ocioso"


def forecast(elapsed, samples):
    if not samples:
        return None
    duration = statistics.median(samples)
    remaining = max(1, round(duration - elapsed), round(elapsed * .2))
    return {"percent": min(99, round(100 * elapsed / (elapsed + remaining))),
            "remaining": remaining}


def snapshot(db, work, online):
    now = int(time.time())
    jobs = db.execute("""SELECT j.id,j.kind,j.state,j.error,t.started,t.stage,
        (SELECT MAX(at) FROM processing_events WHERE job=j.id AND message IN ('Na fila','Voltou para a fila')) queued_at,
        p.title project,c.title clip,CASE WHEN c.id IS NULL THEN p.duration ELSE c.end-c.start END units
        FROM jobs j LEFT JOIN job_progress t ON t.job=j.id LEFT JOIN clips c ON c.id=j.entity
        LEFT JOIN projects p ON p.id=COALESCE(c.project,j.entity)
        WHERE j.state IN ('queued','running','failed') ORDER BY (j.kind='purge') DESC,j.id""").fetchall()
    def describe(j):
        return {"label":LABELS.get(j["kind"],j["kind"]), "project":j["project"], "clip":j["clip"],
                "stage":j["stage"], "started":j["started"], "queuedAt":j["queued_at"], "error":j["error"]}
    active = next((j for j in jobs if j["state"]=="running"), None)
    queue = [j for j in jobs if j["state"]=="queued"]
    failed = [j for j in jobs if j["state"]=="failed"]
    prediction = None
    if active and active["started"]:
        rows = db.execute("""SELECT f.finished-t.started seconds,
            CASE WHEN c.id IS NULL THEN p.duration ELSE c.end-c.start END units
            FROM jobs j JOIN job_finish f ON f.job=j.id JOIN job_progress t ON t.job=j.id
            LEFT JOIN clips c ON c.id=j.entity LEFT JOIN projects p ON p.id=COALESCE(c.project,j.entity)
            WHERE j.state='done' AND j.kind=? AND f.finished>t.started ORDER BY f.finished DESC LIMIT 20""",
            (active["kind"],)).fetchall()
        units = active["units"]
        samples = [r["seconds"] * units/r["units"] if units and r["units"] else r["seconds"] for r in rows]
        if not samples and units and active["kind"] in ("analyze","preview","final"):
            samples = [max(5, units * (2 if active["kind"]=="analyze" else 1))]
        prediction = forecast(max(0, now-active["started"]), samples)
    ready = []
    for clip in db.execute("""SELECT c.id,c.title,c.project,p.title projectTitle,c.state,a.result verdict FROM clips c
        JOIN projects p ON p.id=c.project LEFT JOIN preview_cache cache ON cache.clip=c.id LEFT JOIN audience a ON a.clip=c.id
        WHERE c.state='rendered' OR (c.state='pending_review' AND COALESCE(cache.removed,0)=0
        AND (cache.expires IS NULL OR cache.expires>?)) ORDER BY c.rowid DESC""",(now,)):
        kind = "final" if clip["state"]=="rendered" else "preview"
        if (work/clip["project"]/(clip["id"]+"-"+kind+".mp4")).is_file():
            item = dict(clip)
            raw = item.pop("verdict")
            ready.append({**item,"kind":kind,"audience":json.loads(raw) if raw else None})
    finished = [r[0] for r in db.execute("""SELECT MAX(e.at) FROM processing_events e JOIN jobs j ON j.id=e.job
        WHERE j.state='done' AND e.message='Concluído' AND e.at>=? GROUP BY j.id""",(now-7*86400,))]
    recent = db.execute("""SELECT 'Lia' agent, j.id id, j.kind kind, f.finished at,
        COALESCE(c.title,p.title,'') title FROM job_finish f JOIN jobs j ON j.id=f.job
        LEFT JOIN clips c ON c.id=j.entity LEFT JOIN projects p ON p.id=COALESCE(c.project,j.entity)
        WHERE j.state='done' AND f.finished>=?
        UNION ALL SELECT 'Caio',r.id,'research',t.finished,r.query FROM trend_reports r
        JOIN trend_timing t ON t.report=r.id WHERE r.state='Concluída' AND t.finished>=?
        ORDER BY at DESC LIMIT 50""",(now-7*86400,now-7*86400))
    activity = [{**dict(row),"label":LABELS.get(row["kind"],"Pesquisa de tendências")} for row in recent]
    return {"activity":activity,"status":agent_state(online,active,queue,failed),"current":describe(active) if active else None,
            "prediction":prediction if online else None,"queued":len(queue),"next":describe(queue[0]) if queue else None,
            "failed":len(failed),"lastError":describe(failed[-1]) if failed else None,"finished":finished,"ready":ready}
