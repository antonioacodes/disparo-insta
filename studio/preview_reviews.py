"""Select existing previews for audience evaluation and retroactive Gemini review."""
import time


def next_candidate(db, work, model, mentor_enabled, clip_id=None):
    # A stored supervisor row alone does not mean its verdict reached the inbox.
    rows = db.execute("""SELECT c.*, a.result previous, a.model previous_model
        FROM clips c LEFT JOIN audience a ON a.clip=c.id
        WHERE c.state NOT IN ('detected','rejected','reprovado_gemini')
        AND (? IS NULL OR c.id=?)
        AND (? IS NOT NULL OR (
            (a.clip IS NULL OR a.model!=? OR
             (? AND json_extract(a.result,'$.mentor') IS NULL) OR
             json_extract(a.result,'$.erro') IS NOT NULL)
            AND COALESCE(json_extract(a.result,'$.retryAt'),0)<=?
            AND COALESCE(json_extract(a.result,'$.attempts'),0)<3))
        ORDER BY COALESCE(json_extract(a.result,'$.attempts'),0),c.rowid
        """, (clip_id,clip_id,clip_id,model,mentor_enabled,int(time.time())))
    for row in rows:
        if (work/row['project']/(row['id']+'-preview.mp4')).is_file():
            return row
    return None
