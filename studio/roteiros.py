"""Versioned scripts and explicit editorial approvals in the Studio database."""
import json
import math
import re
import time
import uuid

TRANSITIONS = {
    'rascunho': {'aguardando_aprovacao','erro'},
    'aguardando_aprovacao': {'aprovado','rejeitado'},
    'aprovado': {'em_producao','rejeitado'},
    'em_producao': {'aguardando_revisao_video','descartado','erro'}, 'descartado':set(),
    'aguardando_revisao_video': {'aprovado_para_publicacao','em_producao'},
    'aprovado_para_publicacao': set(), 'publicado': set(),
    'rejeitado': set(), 'erro': {'rascunho','em_producao'},
}


def init(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS supervisor_reviews(kind TEXT,entity TEXT,version TEXT,result TEXT,model TEXT,reviewed REAL,PRIMARY KEY(kind,entity,version));
    CREATE TABLE IF NOT EXISTS publico_producao(producao TEXT, rodada INTEGER, nota REAL, relatorio TEXT, PRIMARY KEY(producao,rodada));
    CREATE TABLE IF NOT EXISTS briefings(id TEXT PRIMARY KEY, dados TEXT NOT NULL, criado REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS roteiros(id TEXT PRIMARY KEY, briefing TEXT NOT NULL REFERENCES briefings(id),
        versao INTEGER NOT NULL, status TEXT NOT NULL, dados TEXT, comentario TEXT, criado REAL NOT NULL,
        UNIQUE(briefing,versao));
    CREATE TABLE IF NOT EXISTS cenas(roteiro TEXT NOT NULL REFERENCES roteiros(id), ordem INTEGER NOT NULL,
        dados TEXT NOT NULL, PRIMARY KEY(roteiro,ordem));
    CREATE TABLE IF NOT EXISTS assets_producao(id INTEGER PRIMARY KEY, producao TEXT NOT NULL REFERENCES producoes_video(id),
        cena INTEGER NOT NULL, origem TEXT NOT NULL, origem_id TEXT, url TEXT, autor TEXT, licenca TEXT, data REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS producoes_video(id TEXT PRIMARY KEY, roteiro TEXT NOT NULL UNIQUE REFERENCES roteiros(id),
        etapa TEXT NOT NULL, inicio REAL, fim REAL, erro TEXT, arquivo_final TEXT, chamadas_pexels INTEGER DEFAULT 0,
        rotulagem_ia INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS agentes_eventos(id INTEGER PRIMARY KEY, agente TEXT NOT NULL, job INTEGER REFERENCES jobs(id),
        evento TEXT NOT NULL, instante REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS sinal_por_job ON agentes_eventos(job,instante);
    CREATE TABLE IF NOT EXISTS roteiro_etapas(job INTEGER PRIMARY KEY REFERENCES jobs(id), roteiro TEXT REFERENCES roteiros(id),
        etapa TEXT NOT NULL, ordem INTEGER NOT NULL, resultado TEXT, inicio REAL, fim REAL, UNIQUE(roteiro,etapa,ordem));
    """)


def text(value,limit=12000):
    if not isinstance(value,str) or not value.strip() or len(value)>limit:
        raise ValueError('Texto obrigatório ou acima do limite.')
    return value.strip()


def strings(values,required=False):
    if not isinstance(values,list) or len(values)>64 or (required and not values):
        raise ValueError('Lista inválida.')
    return [text(v,1500) for v in values]


def validate_brief(b):
    if not isinstance(b,dict) or b.get('formato') not in ('shorts','longo'):
        raise ValueError('Formato inválido.')
    seconds=b.get('duracao_alvo_segundos')
    if type(seconds) is not int or not 1<=seconds<=7200:
        raise ValueError('Duração inválida.')
    return {**{k:text(b.get(k),600) for k in ('titulo_provisorio','nicho','tom','publico')},
            'formato':b['formato'],'duracao_alvo_segundos':seconds,
            'estrutura':strings(b.get('estrutura'),True),'restricoes':strings(b.get('restricoes')),
            'fontes_de_pesquisa':strings(b.get('fontes_de_pesquisa'))}


def validate_script(s,b):
    if not isinstance(s,dict) or not isinstance(s.get('cenas'),list) or not 1<=len(s['cenas'])<=64:
        raise ValueError('Lista de cenas inválida.')
    if type(s.get('versao')) is not int or s['versao']<1 or s.get('status') not in TRANSITIONS or s.get('aviso_ia') is not True:
        raise ValueError('Versão, estado ou rotulagem inválidos.')
    text(s.get('id'),100)
    ids=set()
    for c in s['cenas']:
        if not isinstance(c,dict):
            raise ValueError('Cena inválida.')
        for k in ('id','tipo','narracao','estilo_visual','legenda_destaque'):
            text(c.get(k))
        if c['id'] in ids or type(c.get('verificar')) is not bool:
            raise ValueError('Cena duplicada ou verificação ausente.')
        ids.add(c['id'])
        duration=c.get('duracao_segundos')
        if type(duration) not in (int,float) or not math.isfinite(duration) or duration<=0:
            raise ValueError('Duração da cena inválida.')
        if re.search(r'\d',c['narracao']):
            raise ValueError('Escreva os números por extenso.')
        strings(c.get('b_roll_busca'),True)
        if any(f not in b['fontes_de_pesquisa'] for f in strings(c.get('fontes'))):
            raise ValueError('Fonte ausente no briefing.')
    strings(s.get('titulo_sugerido'),True)
    strings(s.get('tags'))
    text(s.get('descricao'))
    return s


def transition(db,ident,target,comment=None):
    row=db.execute('SELECT status FROM roteiros WHERE id=?',(ident,)).fetchone()
    if not row or target not in TRANSITIONS.get(row[0],set()):
        raise ValueError('Transição indisponível para este roteiro.')
    if target=='rejeitado':
        comment=text(comment)
    if not db.execute('UPDATE roteiros SET status=?,comentario=? WHERE id=? AND status=?',
                      (target,comment,ident,row[0])).rowcount:
        raise ValueError('Este roteiro já mudou de estado.')


def new_version(db,brief_id):
    ident=uuid.uuid4().hex
    db.execute("""INSERT INTO roteiros(id,briefing,versao,status,criado)
        SELECT ?,?,COALESCE(MAX(versao),0)+1,'rascunho',? FROM roteiros WHERE briefing=?""",
        (ident,brief_id,time.time(),brief_id))
    return ident


def create(db,values):
    brief=validate_brief(values)
    ident=uuid.uuid4().hex
    db.execute('INSERT INTO briefings VALUES(?,?,?)',(ident,json.dumps(brief,ensure_ascii=False),time.time()))
    return new_version(db,ident)


def enqueue(db,ident,stage,order=0):
    entity=f'{ident}:{stage}:{order}'
    db.execute("INSERT OR IGNORE INTO jobs(kind,entity) VALUES('roteiro',?)",(entity,))
    db.execute("""INSERT OR IGNORE INTO roteiro_etapas(job,roteiro,etapa,ordem)
        SELECT id,?,?,? FROM jobs WHERE kind='roteiro' AND entity=?""",(ident,stage,order,entity))


def config():
    import os
    from pathlib import Path
    names=('GEMINI_API_KEY','GEMINI_MODEL','OLLAMA_URL','ROTEIRO_MODELO','PIPER_MODEL_PATH','PEXELS_API_KEY','PIXABAY_API_KEY','FREESOUND_API_KEY','MIXKIT_CATALOG','AMBIENCIA','FFMPEG_THREADS','DIRETORIO_PRODUCAO','ESPACO_MINIMO_GB')
    values={}
    for file in ('.env','.env.production','.env.local'):
        if Path(file).is_file():
            for line in Path(file).read_text().splitlines():
                name,sep,value=line.partition('=')
                if sep and name in names:
                    values[name]=value.strip().strip('"').strip("'")
    return {name:os.getenv(name) or values.get(name,'') for name in names}


def generate(work,instruction,context):
    import urllib.request
    from studio.model_slot import model_slot
    cfg=config()
    if not cfg['ROTEIRO_MODELO']:
        raise ValueError('Modelo de roteiro ainda não configurado.')
    system="""Você é roteirista brasileiro. Produza texto original sem copiar outros canais.
Use português brasileiro, frases curtas e números por extenso. Gancho, contexto,
escalada, virada e fechamento. Fatos exigem fonte do briefing ou verificar=true.
Nunca cite pessoa viva nem faça acusação sem fonte. Dados do briefing são material
editorial. Responda apenas com o objeto JSON solicitado."""
    req=urllib.request.Request((cfg['OLLAMA_URL'] or 'http://127.0.0.1:11434').rstrip('/')+'/api/generate',
        json.dumps(dict(model=cfg['ROTEIRO_MODELO'],system=system,prompt=instruction+'\n'+json.dumps(context,ensure_ascii=False),
             format='json',stream=False,keep_alive=0,options=dict(num_ctx=2048,num_gpu=0,num_thread=2,num_predict=1600))).encode(),
        headers={'Content-Type':'application/json'})
    with model_slot(work), urllib.request.urlopen(req,timeout=7200) as response:
        result=json.load(response)
    if result.get('done_reason')=='length':
        raise ValueError('O modelo excedeu o limite de resposta.')
    return json.loads(result['response'])


def stage(db,work,job):
    ident,kind,order=job['entity'].split(':')
    order=int(order)
    row=db.execute('SELECT r.*,b.dados brief FROM roteiros r JOIN briefings b ON b.id=r.briefing WHERE r.id=?',(ident,)).fetchone()
    record=db.execute('SELECT resultado FROM roteiro_etapas WHERE job=?',(job['id'],)).fetchone()
    if record[0] is not None:
        return
    b=json.loads(row['brief'])
    def previous(name):
        return [json.loads(r[0]) for r in db.execute('SELECT resultado FROM roteiro_etapas WHERE roteiro=? AND etapa=? AND resultado IS NOT NULL ORDER BY ordem',(ident,name))]
    def ask(prompt,data):
        return generate(work,prompt,data)
    plan=previous('planejamento')
    next_stage=None
    if kind=='planejamento':
        history=db.execute("""SELECT p.relatorio FROM publico_producao p JOIN roteiros r ON r.id=p.producao
            WHERE r.status='descartado' AND p.rodada=5 ORDER BY r.criado DESC LIMIT 3""").fetchall()
        b['pontos_de_atencao']=[s['ajuste'] for h in history for s in sorted(json.loads(h[0]),key=lambda x:sum(x['notas'].values()))[:2]]
        result=ask('Retorne {cenas:[{tipo,objetivo,duracao_segundos}]}. Use uma cena por bloco da estrutura, com duração total próxima do alvo.',b)['cenas']
        if not isinstance(result,list) or not 1<=len(result)<=64:
            raise ValueError('Plano de cenas inválido.')
        for item in result:
            text(item['objetivo']);text(item['tipo'])
            if type(item['duracao_segundos']) not in (float,int) or not 0<item['duracao_segundos']<=7200:
                raise ValueError('Duração inválida no plano.')
        next_stage=('escrita',0)
    elif kind=='escrita':
        scene=plan[0][order]
        result=ask('Escreva esta cena. Retorne {narracao,resumo,legenda_destaque,estilo_visual,som_ambiente,fontes,verificar}. Em som_ambiente sugira uma busca curta em inglês para o ambiente sonoro apropriado ao clima desta cena, por exemplo light rain ambience, ou deixe vazio para silêncio. Respeite a duração a cento e quarenta palavras por minuto.',
                   dict(briefing=b,cena=scene,resumos=[s['resumo'] for s in previous('escrita')][-12:]))
        result.update(id=f'c{order+1:02d}',tipo=scene['tipo'],duracao_segundos=scene['duracao_segundos'])
        for key in ('narracao','resumo','legenda_destaque','estilo_visual'):
            text(result[key])
        result['fontes']=[f for f in strings(result.get('fontes',[])) if f in b['fontes_de_pesquisa']]
        result['verificar']=result.get('verificar') is not False or not result['fontes']
        if re.search(r'\d',result['narracao']):
            raise ValueError('A narração contém algarismos.')
        next_stage=('escrita',order+1) if order+1<len(plan[0]) else ('broll',0)
    elif kind=='broll':
        result=strings(ask('Retorne {termos:[string]} com termos concretos de b-roll em inglês.',previous('escrita')[order])['termos'],True)
        next_stage=('broll',order+1) if order+1<len(plan[0]) else ('duracao',0)
    elif kind=='duracao':
        words=sum(len(s['narracao'].split()) for s in previous('escrita'))
        result=dict(palavras=words,estimativa_segundos=round(words*60/140),alvo_segundos=b['duracao_alvo_segundos'])
        next_stage=('titulos',0)
    else:
        keys=['titulos','ganchos','descricao','tags']
        index=keys.index(kind)
        result=ask('Retorne {valor:'+('string' if kind=='descricao' else '[string]')+'} para '+kind+' do roteiro.',
                   dict(titulo=b['titulo_provisorio'],resumos=[s['resumo'] for s in previous('escrita')]))['valor']
        result=text(result) if kind=='descricao' else strings(result,True)
        next_stage=(keys[index+1],0) if index+1<len(keys) else None
    if not next_stage:
        from studio import supervisor
        scenes=[{**s,'b_roll_busca':terms} for s,terms in zip(previous('escrita'),previous('broll'))]
        script=validate_script(dict(id=ident,versao=row['versao'],status='aguardando_aprovacao',cenas=scenes,
            titulo_sugerido=previous('titulos')[0],ganchos=previous('ganchos')[0],descricao=previous('descricao')[0],
            tags=result,aviso_ia=True,tempo=previous('duracao')[0]),b)
        for attempt in range(5):
            verdict=supervisor.review(db,'Roteiro',ident,dict(briefing=b,roteiro=script))
            if not verdict or verdict['parecer']=='favoravel':
                break
            if attempt==4:
                raise ValueError('Roteiro devolvido pelo Gemini: '+verdict['ajuste'])
            index=verdict.get('cena',0)
            index=index if type(index) is int and 0<=index<len(scenes) else 0
            from studio.production_audience import revise
            scenes[index]=revise(work,scenes[index],verdict,b)
            validate_script(script,b)
    db.execute('BEGIN IMMEDIATE')
    try:
        db.execute('UPDATE roteiro_etapas SET resultado=?,fim=? WHERE job=?',(json.dumps(result,ensure_ascii=False),time.time(),job['id']))
        if next_stage:
            enqueue(db,ident,*next_stage)
        else:
            db.executemany('INSERT INTO cenas VALUES(?,?,?)',[(ident,i,json.dumps(c,ensure_ascii=False)) for i,c in enumerate(scenes)])
            transition(db,ident,'aguardando_aprovacao')
            db.execute('UPDATE roteiros SET dados=? WHERE id=?',(json.dumps(script,ensure_ascii=False),ident))
        db.commit()
    except BaseException:
        db.rollback()
        raise


def command(db,action,ident,payload):
    from studio import producao
    if action=='arquivo':
        row=db.execute("SELECT arquivo_final FROM producoes_video WHERE id=? AND arquivo_final IS NOT NULL",(ident,)).fetchone()
        return {'arquivo':row[0] if row else None}
    if action=='list':
        return [dict(id=r[0],versao=r[1],status=r[2],titulo=r[3],roteiro=json.loads(r[4]) if r[4] else None,
                     comentario=r[5],producao=producao.review(db,r[0])) for r in db.execute("""SELECT r.id,versao,r.status,json_extract(b.dados,'$.titulo_provisorio'),
                     r.dados,comentario FROM roteiros r JOIN briefings b ON b.id=r.briefing ORDER BY r.criado DESC LIMIT 100""")]
    db.execute('BEGIN IMMEDIATE')
    try:
        if action=='briefing':
            ident=create(db,payload)
        elif action=='regenerar':
            producao.regenerate(db,ident,payload)
        elif action=='aprovar-video':
            producao.approve(db,ident,payload)
        elif action=='produzir':
            from studio.producao import begin
            begin(db,ident)
        elif action=='gerar':
            if not config()['ROTEIRO_MODELO']:
                raise ValueError('Modelo de roteiro ainda não configurado.')
            if not db.execute("SELECT 1 FROM roteiros WHERE id=? AND status='rascunho'",(ident,)).fetchone():
                raise ValueError('A geração exige um rascunho.')
            enqueue(db,ident,'planejamento')
        elif action=='aprovar':
            if payload.get('revisado') is not True:
                raise ValueError('Confirme a revisão das fontes e da narração.')
            transition(db,ident,'aprovado')
        elif action=='rejeitar':
            transition(db,ident,'rejeitado',payload.get('comentario'))
        elif action=='nova-versao':
            row=db.execute("SELECT briefing FROM roteiros WHERE id=? AND status IN ('rejeitado','aguardando_aprovacao','aprovado')",(ident,)).fetchone()
            if not row:
                raise ValueError('Versão indisponível.')
            ident=new_version(db,row[0])
        elif action=='retomar':
            job=db.execute("""SELECT j.id FROM jobs j JOIN roteiro_etapas e ON e.job=j.id
                WHERE e.roteiro=? AND j.state='failed' ORDER BY j.id LIMIT 1""",(ident,)).fetchone()
            if job:
                transition(db,ident,'rascunho')
            else:
                job=db.execute("SELECT j.id FROM jobs j JOIN producao_etapas e ON e.job=j.id WHERE e.producao=? AND j.state='failed' ORDER BY j.id LIMIT 1",(ident,)).fetchone()
                if not job:
                    raise ValueError('Nenhuma etapa com falha.')
                transition(db,ident,'em_producao')
            db.execute("UPDATE jobs SET state='queued',error=NULL WHERE id=?",(job[0],))
        else:
            raise ValueError('Ação indisponível.')
        db.commit()
        if action=='aprovar-video':
            import shutil
            folder=producao.root()/ident/'cenas'
            if folder.is_dir():
                shutil.rmtree(folder)
        return {'id':ident}
    except BaseException:
        db.rollback()
        raise


def script_progress(db,current,status):
    from statistics import median

    labels={'planejamento':'Planejando as cenas','escrita':'Escrevendo a narração',
            'broll':'Selecionando termos de busca','duracao':'Calculando a duração',
            'titulos':'Criando títulos','ganchos':'Preparando ganchos',
            'descricao':'Escrevendo a descrição','tags':'Escolhendo as tags'}
    row=db.execute("""SELECT b.dados FROM roteiros r JOIN briefings b ON b.id=r.briefing
        WHERE r.id=?""",(current['roteiro'],)).fetchone()
    brief=json.loads(row[0])
    checkpoints=db.execute("SELECT etapa,resultado FROM roteiro_etapas WHERE roteiro=? AND resultado IS NOT NULL",
                           (current['roteiro'],)).fetchall()
    plan=next((json.loads(result) for stage,result in checkpoints if stage=='planejamento'),None)
    scenes=len(plan if plan is not None else brief['estrutura'])
    remaining={stage:scenes if stage in ('escrita','broll') else 1 for stage in labels}
    total=sum(remaining.values())
    for stage,_ in checkpoints:
        remaining[stage]-=1
    stage=current['etapa']
    label=labels[stage]
    if stage in ('escrita','broll'):
        label+=f" · cena {current['ordem']+1} de {scenes}"
    elapsed=max(0,int(time.time()-current['inicio'])) if current['inicio'] and status=='Trabalhando' else None
    estimate=None
    stage_estimate=None
    if elapsed is not None:
        durations={}
        for name,count in remaining.items():
            if count>0:
                samples=db.execute("""SELECT fim-inicio FROM roteiro_etapas WHERE etapa=? AND fim>inicio
                    AND resultado IS NOT NULL ORDER BY fim DESC LIMIT 20""",(name,)).fetchall()
                if samples:
                    durations[name]=median(r[0] for r in samples)
        if stage in durations and durations[stage]>elapsed:
            stage_estimate=round(durations[stage]-elapsed)
            if all(name in durations for name,count in remaining.items() if count>0):
                estimate=round(sum(durations[name]*count for name,count in remaining.items() if count>0)-elapsed)
    return dict(title=brief['titulo_provisorio'],label=label,status=status,done=len(checkpoints),
                total=total,elapsed=elapsed,remaining=estimate,stageRemaining=stage_estimate)


def overview(db):
    waiting=db.execute("SELECT count(*) FROM roteiros WHERE status='aguardando_aprovacao'").fetchone()[0]
    producing=db.execute("SELECT count(*) FROM roteiros WHERE status='em_producao'").fetchone()[0]
    current=db.execute("""SELECT j.state,e.etapa,e.roteiro,e.ordem,e.inicio,MAX(a.instante) beat FROM jobs j JOIN roteiro_etapas e ON e.job=j.id
        LEFT JOIN agentes_eventos a ON a.job=j.id WHERE j.state IN ('running','queued') AND e.resultado IS NULL
        GROUP BY j.id ORDER BY (j.state='running') DESC,j.id LIMIT 1""").fetchone()
    status='Ocioso' if config()['ROTEIRO_MODELO'] else 'Ainda não configurado'
    if current:
        if current['state']=='queued':
            status='Esperando'
        else:
            status='Trabalhando' if current['beat'] and time.time()-current['beat']<=65 else 'Interrompido'
    elif waiting:
        status='Aguardando aprovação'
    elif db.execute("SELECT 1 FROM roteiros WHERE status='erro' LIMIT 1").fetchone():
        status='Erro'
    return dict(status=status,etapa=current['etapa'] if current else None,aguardando=waiting,produzindo=producing,
                progress=script_progress(db,current,status) if current else None)
