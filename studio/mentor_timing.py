"""Create a separately reviewable cut when the mentor requests a timing correction."""
import json
from studio import roteiros


def revise(db,work,cid,verdict):
    row=db.execute('SELECT c.*,p.duration,p.transcript FROM clips c JOIN projects p ON p.id=c.project WHERE c.id=?',(cid,)).fetchone()
    if not row or not row['transcript']:
        return
    depth=0
    parent=cid
    while found:=db.execute('SELECT parent FROM revisions WHERE id=?',(parent,)).fetchone():
        parent=found[0]
        depth+=1
    if depth>=4:
        return
    from pathlib import Path
    segments=json.loads(Path(row['transcript']).read_text())['segments']
    nearby=[dict(start=s['start'],end=s['end'],text=s['text']) for s in segments
            if s['end']>=row['start']-15 and s['start']<=row['end']+15]
    plan=roteiros.generate(work,
        'Decida se a devolução exige ajustar início ou fim do corte. Retorne {ajustar:boolean,inicio:number,fim:number}. '
        'Use tempos absolutos da transcrição. Preserve o assunto e conclua as frases. Se o problema for outro, ajustar=false.',
        dict(parecer=verdict,inicio=row['start'],fim=row['end'],falas=nearby))
    if plan.get('ajustar') is not True:
        return
    a,b=plan.get('inicio'),plan.get('fim')
    if type(a) not in (int,float) or type(b) not in (int,float) or not 0<=a<b<=row['duration']:
        raise ValueError('Revisão temporal inválida.')
    if abs(a-row['start'])>15 or abs(b-row['end'])>15 or (a==row['start'] and b==row['end']):
        raise ValueError('Revisão temporal fora do contexto.')
    db.execute('BEGIN IMMEDIATE')
    try:
        if db.execute('SELECT 1 FROM revisions WHERE parent=?',(cid,)).fetchone():
            db.commit()
            return
        suffix=max(int(r[0].rsplit('-',1)[1]) for r in db.execute('SELECT id FROM clips WHERE project=?',(row['project'],)))+1
        child=row['project']+'-'+str(suffix)
        db.execute('INSERT INTO clips VALUES(?,?,?,?,?,?,?,?)',(child,row['project'],a,b,row['title'],row['score'],verdict['ajuste'],'detected'))
        db.execute('INSERT INTO revisions(id,parent) VALUES(?,?)',(child,cid))
        db.execute("INSERT INTO jobs(kind,entity) VALUES('preview',?)",(child,))
        db.commit()
    except BaseException:
        db.rollback()
        raise
