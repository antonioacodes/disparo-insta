"""Editorial decisions and exactly-once handoff of selected videos to the Studio."""
import json
import time
from studio import producao, roteiros


def init(db):
    db.execute("""CREATE TABLE IF NOT EXISTS activity_decisions(
        kind TEXT, entity TEXT, approved INTEGER, title TEXT, at REAL, PRIMARY KEY(kind,entity))""")
    db.execute("""CREATE TABLE IF NOT EXISTS trend_handoff(report TEXT PRIMARY KEY, options TEXT, items TEXT)""")


def pending(db,ready):
    rows=[dict(kind='preview',entity=c['id'],title=c['title'],agent='Lia') for c in ready if c['kind']=='preview']
    for r in db.execute("""SELECT r.id,r.status,json_extract(b.dados,'$.titulo_provisorio') title
        FROM roteiros r JOIN briefings b ON b.id=r.briefing WHERE r.status IN ('rascunho','aguardando_aprovacao','aguardando_revisao_video')
        AND (r.status!='rascunho' OR NOT EXISTS(SELECT 1 FROM roteiro_etapas e WHERE e.roteiro=r.id)) ORDER BY r.criado DESC"""):
        kind={'rascunho':'briefing','aguardando_aprovacao':'script','aguardando_revisao_video':'video'}[r['status']]
        rows.append(dict(kind=kind,entity=r['id'],title=r['title'],agent='Bia' if kind!='video' else 'Lia'))
    for r in db.execute("""SELECT r.id,r.query FROM trend_reports r WHERE r.state='Concluída'
        AND NOT EXISTS(SELECT 1 FROM activity_decisions d WHERE d.kind='trend' AND d.entity=CAST(r.id AS TEXT)) ORDER BY r.id DESC"""):
        rows.append(dict(kind='trend',entity=str(r['id']),title=r['query'],agent='Caio'))
    for r in db.execute("""SELECT j.id,j.kind,coalesce(c.title,p.title,j.entity) title FROM jobs j
        JOIN job_finish f ON f.job=j.id LEFT JOIN clips c ON c.id=j.entity LEFT JOIN projects p ON p.id=j.entity
        WHERE j.state='done' AND j.kind IN ('analyze','import','final') AND NOT EXISTS(
        SELECT 1 FROM activity_decisions d WHERE d.kind='job' AND d.entity=CAST(j.id AS TEXT)) ORDER BY f.finished DESC"""):
        rows.append(dict(kind='job',entity=str(r['id']),title=r['title'],agent='Lia',
                         label={'import':'Importação concluída','analyze':'Análise concluída','final':'Exportação concluída'}[r['kind']]))
    for r in db.execute("""SELECT p.* FROM mentor_products p WHERE NOT EXISTS(
        SELECT 1 FROM activity_decisions d WHERE d.kind='mentorProduct' AND d.entity=p.id) ORDER BY created DESC"""):
        rows.append(dict(kind='mentorProduct',entity=r['id'],title=r['title'],agent='Lia',label=r['kind'],reason=r['reason']))
    return rows


def candidates(raw):
    from studio.link_source import source_url
    result={}
    for item in raw:
        try:
            provider,url=source_url(item.get('url') or '')
        except ValueError:
            continue
        if provider in ('Youtube','TwitchVod','KickVOD'):
            result.setdefault(url,{**item,'url':url})
    return list(result.values())


def decide(db,work,project,kind,entity,approve,opts):
    from studio.cache import remove_preview
    if not isinstance(opts,dict):
        raise ValueError('Opções inválidas.')
    db.execute('BEGIN IMMEDIATE')
    cleanup=None
    try:
        old=db.execute('SELECT approved FROM activity_decisions WHERE kind=? AND entity=?',(kind,entity)).fetchone()
        if old:
            if bool(old[0])!=approve:
                raise ValueError('Esta atividade já recebeu outra decisão.')
            db.commit()
            return
        if kind=='mentorProduct':
            if approve:
                raise ValueError('Produto reprovado pelo Gemini.')
            row=db.execute('SELECT title FROM mentor_products WHERE id=?',(entity,)).fetchone()
            if not row:
                raise ValueError('Produto indisponível.')
            title=row[0]
            (work/'mentor-products'/(entity+'.mp4')).unlink(missing_ok=True)
        elif kind=='job':
            row=db.execute("SELECT kind FROM jobs WHERE id=? AND state='done' AND kind IN ('final','analyze','import')",(entity,)).fetchone()
            if not row:
                raise ValueError('Conclusão indisponível.')
            title=opts.get('title') or row[0]
        elif kind=='preview':
            row=db.execute("SELECT project,title FROM clips WHERE id=? AND state='pending_review'",(entity,)).fetchone()
            if not row or not (work/row[0]/(entity+'-preview.mp4')).is_file():
                raise ValueError('Prévia indisponível.')
            title=row[1]
            db.execute('UPDATE clips SET state=? WHERE id=?',('approved' if approve else 'rejected',entity))
            if approve:
                db.execute("INSERT OR IGNORE INTO jobs(kind,entity) VALUES('final',?)",(entity,))
            else:
                db.execute('INSERT OR REPLACE INTO preview_cache VALUES(?,0,0)',(entity,))
                cleanup=row[0]
        elif kind=='trend':
            row=db.execute("SELECT query,items FROM trend_reports WHERE id=? AND state='Concluída'",(entity,)).fetchone()
            if not row:
                raise ValueError('Relatório indisponível.')
            title=row[0]
            if approve:
                items=candidates(json.loads(row[1] or '[]'))
                if not items:
                    raise ValueError('Este relatório não contém vídeos ou gravações importáveis.')
                mode=opts.get('mode')
                if mode=='ai':
                    db.execute('INSERT INTO trend_handoff VALUES(?,?,?)',(entity,json.dumps(opts),json.dumps(items)))
                    db.execute("INSERT INTO jobs(kind,entity) VALUES('trend-select',?) ON CONFLICT(kind,entity) DO UPDATE SET state='queued',error=NULL",(entity,))
                elif mode in ('views','score'):
                    count=opts.get('count')
                    if type(count)!=int or not 1<=count<=len(items):
                        raise ValueError(f'Escolha de um a {len(items)} vídeos.')
                    for item in sorted(items,key=lambda i:i.get(mode) or 0,reverse=True)[:count]:
                        project(item['url'],item['title'],json.dumps(opts['preset']),remote=True)
                else:
                    raise ValueError('Escolha o critério de seleção.')
        elif kind in ('briefing','script','video'):
            expected={'briefing':'rascunho','script':'aguardando_aprovacao','video':'aguardando_revisao_video'}[kind]
            row=db.execute("""SELECT json_extract(b.dados,'$.titulo_provisorio') FROM roteiros r JOIN briefings b
                ON b.id=r.briefing WHERE r.id=? AND r.status=?""",(entity,expected)).fetchone()
            if not row:
                raise ValueError('A etapa mudou. Atualize o painel.')
            title=row[0]
            if kind=='briefing' and db.execute('SELECT 1 FROM roteiro_etapas WHERE roteiro=?',(entity,)).fetchone():
                raise ValueError('Geração já iniciada.')
            if not approve:
                db.execute("UPDATE roteiros SET status='rejeitado',comentario=? WHERE id=?",(opts.get('comentario') or 'Reprovado no painel',entity))
            elif kind=='briefing':
                if not roteiros.config()['ROTEIRO_MODELO']:
                    raise ValueError('Configure o modelo de roteiros.')
                roteiros.enqueue(db,entity,'planejamento')
            elif kind=='script':
                if opts.get('revisado') is not True:
                    raise ValueError('Confira o roteiro antes de aprovar.')
                roteiros.transition(db,entity,'aprovado')
                producao.begin(db,entity)
            else:
                producao.approve(db,entity,opts)
        else:
            raise ValueError('Atividade inválida.')
        db.execute('INSERT INTO activity_decisions VALUES(?,?,?,?,?)',(kind,entity,approve,title,time.time()))
        db.commit()
    except BaseException:
        db.rollback()
        raise
    if cleanup:
        remove_preview(work,cleanup,entity)
        db.execute('UPDATE preview_cache SET removed=1 WHERE clip=?',(entity,))


def select_with_ai(db,work,project,entity):
    row=db.execute('SELECT options,items FROM trend_handoff WHERE report=?',(entity,)).fetchone()
    if not row:
        return
    opts,items=map(json.loads,row)
    data=[{k:item.get(k) for k in ('title','score','views','rate','seconds')} for item in items]
    result=roteiros.generate(work,'Escolha de um a três vídeos para cortes. Retorne {"indices":[0]} com índices distintos começando em zero. Considere tema, engajamento, duração e relevância.',data)
    ids=result.get('indices')
    if not isinstance(ids,list) or not 1<=len(ids)<=3 or any(type(i)!=int or not 0<=i<len(items) for i in ids) or len(set(ids))!=len(ids):
        raise ValueError('O modelo retornou uma seleção inválida.')
    db.execute('BEGIN IMMEDIATE')
    try:
        for i in ids:
            project(items[i]['url'],items[i]['title'],json.dumps(opts['preset']),remote=True)
        db.execute('DELETE FROM trend_handoff WHERE report=?',(entity,))
        db.commit()
    except BaseException:
        db.rollback()
        raise
