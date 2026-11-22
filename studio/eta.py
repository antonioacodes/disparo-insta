"""Estimate remaining processing seconds using completed jobs on this worker."""
import statistics
import time


def estimates(db):
    rows = db.execute("""
        SELECT j.kind, j.state, p.id project, p.duration,
               c.end-c.start clip_seconds, t.started, f.finished
        FROM jobs j
        JOIN projects p ON p.id=j.entity OR
          (j.kind='preview' AND p.id=(SELECT project FROM clips WHERE id=j.entity))
        LEFT JOIN clips c ON c.id=j.entity
        LEFT JOIN job_progress t ON t.job=j.id
        LEFT JOIN job_finish f ON f.job=j.id
        WHERE j.kind IN ('import','analyze','preview')
        ORDER BY j.id
    """).fetchall()
    rates = {}
    projects = {}
    for row in rows:
        kind = row["kind"]
        projects.setdefault(row["project"], []).append(row)
        if row["state"] == "done" and row["started"] and row["finished"]:
            seconds = row["finished"] - row["started"]
            units = row["clip_seconds"] if kind == "preview" else row["duration"]
            if units and seconds > 0:
                rates.setdefault(kind, []).append(seconds / units)
    def rate(kind, default):
        history = rates.get(kind, [])[-20:]
        return statistics.median(history) if history else default

    now = time.time()
    result = {}
    for project, tasks in projects.items():
        pending = [r for r in tasks if r["state"] in ("queued","running")]
        if not pending:
            continue
        duration = tasks[0]["duration"]
        if not duration or any(r["kind"]=="import" for r in pending):
            continue
        remaining = 0
        for row in pending:
            analyze = row["kind"] == "analyze"
            units = duration if analyze else row["clip_seconds"]
            budget = max(5, units * rate(row["kind"], 2 if analyze else 1))
            elapsed = max(0, now-row["started"]) if row["started"] and row["state"]=="running" else 0
            # A slow job can outlive the initial forecast. Widen the margin as it runs.
            remaining += max(budget-elapsed, 0.2*budget, 0.25*elapsed)
            if analyze and not any(r["kind"]=="preview" for r in tasks):
                remaining += min(450, duration) * rate("preview", 1)
        result[project] = {"low":max(1, round(remaining*0.6)), "high":max(2, round(remaining*1.8))}
    return result
