"""Scene-based CPU production. External calls happen only inside approved worker jobs."""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

from studio import production_audience as audience
from studio import stock_media as stock
from studio.roteiros import config, transition

STAGES=('cenas','broll','narracao','montagem','legendas')


def init(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS producao_etapas(job INTEGER PRIMARY KEY REFERENCES jobs(id),
      producao TEXT REFERENCES producoes_video(id), etapa TEXT, cena INTEGER, inicio REAL, fim REAL);
    CREATE TABLE IF NOT EXISTS producao_legendas(producao TEXT, cena INTEGER, srt TEXT NOT NULL, segundos REAL NOT NULL, PRIMARY KEY(producao,cena));
    CREATE TABLE IF NOT EXISTS pexels_consultas(instante REAL, producao TEXT, restante INTEGER, reinicio INTEGER);
    CREATE INDEX IF NOT EXISTS chamadas_por_data ON pexels_consultas(instante);
    """)


def root():
    return Path(config()['DIRETORIO_PRODUCAO'] or 'storage/producoes').resolve()


def check_space():
    directory=root()
    directory.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(directory).free < float(config()['ESPACO_MINIMO_GB'] or 5)*1024**3:
        raise ValueError('Espaço insuficiente para a produção.')


def enqueue(db,pid,stage,scene):
    entity=f'{pid}:{stage}:{scene}'
    db.execute("INSERT OR IGNORE INTO jobs(kind,entity) VALUES('producao',?)",(entity,))
    db.execute("""INSERT OR IGNORE INTO producao_etapas(job,producao,etapa,cena)
        SELECT id,?,?,? FROM jobs WHERE kind='producao' AND entity=?""",(pid,stage,scene,entity))


def begin(db,ident):
    check_space()
    transition(db,ident,'em_producao')
    db.execute("INSERT INTO producoes_video(id,roteiro,etapa,inicio) VALUES(?,?,'na_fila',?)",(ident,ident,time.time()))
    enqueue(db,ident,'cenas',0)


def pexels(db,pid,i,scene,vertical):
    cfg=config()
    cache=root()/'cache-pexels'
    cache.mkdir(exist_ok=True)
    for term in scene['b_roll_busca']:
        params=urllib.parse.urlencode(dict(query=term,orientation='portrait' if vertical else 'landscape',per_page=4))
        cached=cache/(hashlib.sha256(params.encode()).hexdigest()+'.json')
        if cached.exists() and cached.stat().st_mtime>time.time()-86400:
            videos=json.loads(cached.read_text())
        else:
            if not cfg['PEXELS_API_KEY']:
                raise ValueError('Configure PEXELS_API_KEY para pesquisar b-roll.')
            now=time.time()
            hourly,monthly=db.execute("SELECT count(CASE WHEN instante>? THEN 1 END),count(*) FROM pexels_consultas WHERE instante>?",(now-3600,now-31*86400)).fetchone()
            limited=db.execute('SELECT 1 FROM pexels_consultas WHERE restante<=2 AND reinicio>? LIMIT 1',(now,)).fetchone()
            if hourly>=198 or monthly>=19998 or limited:
                raise ValueError('Cota do Pexels próxima do limite. Retome a etapa após a renovação.')
            rid=db.execute('INSERT INTO pexels_consultas(instante,producao) VALUES(?,?)',(now,pid)).lastrowid
            db.execute('UPDATE producoes_video SET chamadas_pexels=chamadas_pexels+1 WHERE id=?',(pid,))
            req=urllib.request.Request('https://api.pexels.com/videos/search?'+params)
            try:
                for key in stock.keys(cfg['PEXELS_API_KEY']):
                    req.add_header('Authorization',key)
                    try:
                        response=urllib.request.urlopen(req,timeout=45)
                        break
                    except urllib.error.HTTPError as exc:
                        if exc.code!=401:
                            raise
                else:
                    raise ValueError('Chaves Pexels inválidas.')
                with response:
                    videos=json.load(response)['videos']
                    db.execute('UPDATE pexels_consultas SET restante=?,reinicio=? WHERE rowid=?',(response.headers.get('X-Ratelimit-Remaining'),response.headers.get('X-Ratelimit-Reset'),rid))
            except urllib.error.HTTPError as e:
                if e.code==429:
                    db.execute('UPDATE pexels_consultas SET restante=0,reinicio=? WHERE rowid=?',(now+3600,rid))
                raise ValueError(f'Pexels respondeu HTTP {e.code}.') from None
            cached.write_text(json.dumps(videos))
        for v in videos:
            files=[f for f in v['video_files'] if f.get('file_type')=='video/mp4' and f.get('width') and f.get('height')]
            if not files:
                continue
            file=min(files,key=lambda f:abs(max(f['width'],f['height'])-1920))
            path=cache/(str(int(file['id']))+'.mp4')
            if not path.exists():
                if urllib.parse.urlparse(file['link']).scheme!='https':
                    raise ValueError('URL de download inválida.')
                with urllib.request.urlopen(file['link'],timeout=120) as response, tempfile.NamedTemporaryFile(dir=cache,delete=False) as tmp:
                    shutil.copyfileobj(response,tmp)
                Path(tmp.name).replace(path)
            info=('Pexels',str(v['id']),v['url'],v['user']['name'],'https://www.pexels.com/license/')
            break
        else:
            continue
        break
    else:
        return None
    return path,info


def visual(db,pid,i,scene,vertical):
    cfg=config()
    cache=root()/'cache-stock'
    cache.mkdir(exist_ok=True)
    terms=scene['b_roll_busca'][:3]
    asset=None
    for term in terms:
        asset=stock.attempt('Mixkit',stock.mixkit,cfg,term)
        if not asset and cfg['PIXABAY_API_KEY']:
            asset=stock.attempt('Pixabay',stock.pixabay,cfg,cache,term,vertical)
        if not asset and cfg['PEXELS_API_KEY']:
            asset=stock.attempt('Pexels',pexels,db,pid,i,{'b_roll_busca':[term]},vertical)
        if not asset:
            asset=stock.attempt('Commons',stock.commons,cache,term)
        if asset:
            break
    path,info=asset or (None,('Fundo sólido',None,None,None,None))
    db.execute('DELETE FROM assets_producao WHERE producao=? AND cena=?',(pid,i))
    db.execute('INSERT INTO assets_producao(producao,cena,origem,origem_id,url,autor,licenca,data) VALUES(?,?,?,?,?,?,?,?)',(pid,i,*info,time.time()))
    return str(path) if path else None


def srt(narration,seconds):
    words=narration.split()
    min_blocks=max(1,math.ceil(seconds/3))
    max_blocks=math.floor(seconds/1.5)
    for n in range(min_blocks,min(max_blocks,len(words))+1):
        chunks=[textwrap.wrap(' '.join(words[round(i*len(words)/n):round((i+1)*len(words)/n)]),35) for i in range(n)]
        if all(1<=len(c)<=2 for c in chunks):
            def stamp(t):
                ms=round(t*1000)
                return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
            return '\n\n'.join(f'{i+1}\n{stamp(i*seconds/n)} --> {stamp((i+1)*seconds/n)}\n'+ '\n'.join(c) for i,c in enumerate(chunks))+'\n'
    raise ValueError('Texto e duração incompatíveis com os limites de legenda. Revise a cena.')


def audio_seconds(path):
    with wave.open(str(path)) as stream:
        return stream.getnframes()/stream.getframerate()


def ffmpeg(args,folder):
    threads=str(max(1,min(4,int(config()['FFMPEG_THREADS'] or 2))))
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-filter_threads',threads,
                    *args[:-1],'-threads',threads,args[-1]],cwd=folder,check=True,timeout=7200)


def process(db,work,job):
    pid,stage,num=job['entity'].split(':')
    i=int(num)
    if db.execute('SELECT fim FROM producao_etapas WHERE job=?',(job['id'],)).fetchone()[0]:
        return
    row=db.execute("""SELECT r.dados,json_extract(b.dados,'$.formato'),r.status FROM roteiros r
        JOIN briefings b ON b.id=r.briefing WHERE r.id=?""",(pid,)).fetchone()
    if not row or row[2]!='em_producao':
        raise ValueError('Produção exige roteiro aprovado.')
    check_space()
    scenes=json.loads(row[0])['cenas']
    vertical=row[1]=='shorts'
    folder=root()/pid
    folder.mkdir(exist_ok=True)
    media=folder/'cenas'
    media.mkdir(exist_ok=True)
    db.execute('UPDATE producoes_video SET etapa=?,erro=NULL WHERE id=?',(stage,pid))
    db.execute('UPDATE producao_etapas SET inicio=? WHERE job=?',(time.time(),job['id']))
    name=f'c{i:03d}'
    scene=scenes[i] if stage in STAGES else None
    if stage=='broll':
        (media/(name+'.json')).write_text(json.dumps(visual(db,pid,i,scene,vertical)))
    elif stage=='narracao':
        voice=config()['PIPER_MODEL_PATH']
        if not voice or not Path(voice).is_file():
            raise ValueError('Configure o arquivo da voz em PIPER_MODEL_PATH.')
        path=media/(name+'.wav')
        subprocess.run([shutil.which('piper') or '/home/acodes-painel/piper-env/bin/piper','--model',voice,'--output_file',str(path)],input=scene['narracao'],text=True,check=True,timeout=900)
        audio_seconds(path)
    elif stage=='montagem':
        duration=audio_seconds(media/(name+'.wav'))
        w,h=(1080,1920) if vertical else (1920,1080)
        video=json.loads((media/(name+'.json')).read_text())
        source=['-stream_loop','-1','-i',video] if video else ['-f','lavfi','-i',f'color=c=0x253746:s={w}x{h}:r=25']
        frames=max(1,round(duration*25))
        filters=f"fps=25,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,zoompan=z='1+0.05*min(on/{frames},1)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=25,eq=saturation=0.96,fade=in:0:4,fade=out:{max(0,frames-4)}:4"
        inputs=[*source,'-i',name+'.wav']
        mapping=['-map','0:v:0','-map','1:a:0']
        cfg=config()
        term=scene.get('som_ambiente',scene['b_roll_busca'][0]+' ambience')
        if cfg['AMBIENCIA'].lower() not in ('off','0') and isinstance(term,str) and term.strip():
            cache=root()/'cache-stock'
            cache.mkdir(exist_ok=True)
            sound=None
            if cfg['FREESOUND_API_KEY']:
                sound=stock.attempt('Freesound',stock.freesound,cfg,cache,term)
            if not sound:
                sound=stock.attempt('Commons',stock.commons,cache,term,True)
            db.execute("DELETE FROM assets_producao WHERE producao=? AND cena=? AND origem LIKE 'Ambiência · %'",(pid,i))
            if sound:
                path,(provider,ident,url,author,license)=sound
                inputs+=['-stream_loop','-1','-i',str(path)]
                fade=min(0.5,duration/2)
                graph=f'[2:a]volume=0.08,afade=t=in:d={fade},afade=t=out:st={duration-fade}:d={fade}[bed];[1:a][bed]amix=inputs=2:duration=first:normalize=0[a]'
                mapping=['-filter_complex',graph,'-map','0:v:0','-map','[a]']
                db.execute('INSERT INTO assets_producao(producao,cena,origem,origem_id,url,autor,licenca,data) VALUES(?,?,?,?,?,?,?,?)',
                           (pid,i,'Ambiência · '+provider,ident,url,author,license,time.time()))
        ffmpeg([*inputs,*mapping,'-t',str(duration),'-vf',filters,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac',name+'.mp4'],media)
    elif stage=='legendas':
        duration=audio_seconds(media/(name+'.wav'))
        (media/(name+'.srt')).write_text(srt(scene['narracao'],duration))
        ffmpeg(['-i',name+'.mp4','-vf','subtitles='+name+'.srt','-c:v','libx264','-preset','veryfast','-c:a','copy',name+'-leg.mp4'],media)
    elif stage=='finalizar':
        for ext,out in [('-leg.mp4','final.mp4'),('.wav','narracao.wav')]:
            (media/'lista.txt').write_text(''.join(f"file 'c{index:03d}{ext}'\n" for index in range(len(scenes))))
            target=folder/out
            temp=target.with_name('tmp-'+target.name)
            ffmpeg(['-f','concat','-safe','1','-i','lista.txt','-c','copy',str(temp)],media)
            temp.replace(target)
    elif stage=='publico':
        reports=audience.assess(db,work,pid,scenes,media)
        grade=audience.score(reports)
        weakest=min(range(len(scenes)),key=lambda n:audience.score([reports[n]]))
        from studio import supervisor
        verdict=supervisor.review(db,'Vídeo',pid,dict(roteiro=scenes),folder/'final.mp4')
        returned=bool(verdict and verdict['parecer']=='devolver')
        if returned:
            index=verdict.get('cena')
            if type(index) is int and 0<=index<len(scenes):
                weakest=index
            reports[weakest]['ajuste']+=' · Gemini: '+verdict['ajuste']
            reports[weakest]['problema']+=' · Gemini: '+verdict['problema']
        if (grade<80 or returned) and i<5:
            brief=json.loads(db.execute('SELECT b.dados FROM briefings b JOIN roteiros r ON r.briefing=b.id WHERE r.id=?',(pid,)).fetchone()[0])
            scenes[weakest]=audience.revise(work,scenes[weakest],reports[weakest],brief)
        if (grade<80 or returned) and i>=5:
            (folder/'final.mp4').unlink(missing_ok=True)
    db.execute('BEGIN IMMEDIATE')
    try:
        db.execute('UPDATE producao_etapas SET fim=? WHERE job=?',(time.time(),job['id']))
        if stage=='legendas':
            db.execute('INSERT OR REPLACE INTO producao_legendas VALUES(?,?,?,?)',(pid,i,(media/(name+'.srt')).read_text(),duration))
        if stage=='finalizar':
            last=db.execute('SELECT COALESCE(MAX(rodada),0) FROM publico_producao WHERE producao=?',(pid,)).fetchone()[0]
            enqueue(db,pid,'publico',last+1)
            db.execute("UPDATE producoes_video SET etapa='teste de público',arquivo_final=NULL WHERE id=?",(pid,))
        elif stage=='publico':
            db.execute('INSERT INTO publico_producao VALUES(?,?,?,?)',(pid,i,grade,json.dumps(reports,ensure_ascii=False)))
            if grade>=80 and not returned:
                transition(db,pid,'aguardando_revisao_video')
                db.execute("UPDATE producoes_video SET etapa='concluida',fim=?,arquivo_final=? WHERE id=?",(time.time(),str(folder/'final.mp4'),pid))
            elif i>=5:
                transition(db,pid,'descartado',reports[weakest]['problema'])
                db.execute("UPDATE producoes_video SET etapa='descartado pelo público',fim=?,arquivo_final=NULL WHERE id=?",(time.time(),pid))
            else:
                script=json.loads(row[0])
                script['cenas']=scenes
                db.execute('UPDATE roteiros SET dados=? WHERE id=?',(json.dumps(script,ensure_ascii=False),pid))
                db.execute('UPDATE cenas SET dados=? WHERE roteiro=? AND ordem=?',(json.dumps(scenes[weakest],ensure_ascii=False),pid,weakest))
                for step in ('broll','narracao','montagem','legendas','finalizar'):
                    index=0 if step=='finalizar' else weakest
                    task=db.execute('SELECT job FROM producao_etapas WHERE producao=? AND etapa=? AND cena=?',(pid,step,index)).fetchone()[0]
                    db.execute("UPDATE jobs SET state='queued',error=NULL WHERE id=?",(task,))
                    db.execute('UPDATE producao_etapas SET inicio=NULL,fim=NULL WHERE job=?',(task,))
        else:
            candidates=db.execute("""SELECT e.job,e.etapa,e.cena FROM producao_etapas e JOIN jobs j ON j.id=e.job
                WHERE e.producao=? AND j.state='queued' LIMIT 1""",(pid,)).fetchone()
            if not candidates:
                if stage=='cenas':
                    enqueue(db,pid,'broll',0)
                elif i+1<len(scenes):
                    enqueue(db,pid,stage,i+1)
                else:
                    enqueue(db,pid,(*STAGES,'finalizar')[STAGES.index(stage)+1],0)
        db.commit()
    except BaseException:
        db.rollback()
        raise


def queue_pending_reviews(db):
    db.execute('BEGIN IMMEDIATE')
    try:
        pending=db.execute("""SELECT r.id FROM roteiros r JOIN producoes_video p ON p.id=r.id
            WHERE r.status='aguardando_revisao_video' AND p.arquivo_final IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM publico_producao a WHERE a.producao=r.id)""").fetchall()
        for (pid,) in pending:
            transition(db,pid,'em_producao')
            db.execute("UPDATE producoes_video SET arquivo_final=NULL,fim=NULL,etapa='teste de público' WHERE id=?",(pid,))
            enqueue(db,pid,'publico',1)
        db.commit()
    except BaseException:
        db.rollback()
        raise


def review(db,pid):
    row=db.execute('SELECT * FROM producoes_video WHERE id=?',(pid,)).fetchone()
    if not row:
        return None
    steps=[dict(r) for r in db.execute('SELECT etapa,cena,inicio,fim FROM producao_etapas WHERE producao=? ORDER BY job',(pid,))]
    assets=[dict(r) for r in db.execute('SELECT cena,origem,url,autor,licenca FROM assets_producao WHERE producao=? ORDER BY cena',(pid,))]
    return dict(publico=[dict(rodada=r[0],nota=r[1],cenas=json.loads(r[2])) for r in db.execute("SELECT rodada,nota,relatorio FROM publico_producao WHERE producao=? ORDER BY rodada",(pid,))],etapa=row['etapa'],erro=row['erro'],chamadas=row['chamadas_pexels'],etapas=steps,
                pronto=bool(row['arquivo_final']),assets=assets,legendas=[dict(r) for r in db.execute(
                    'SELECT cena,srt,segundos FROM producao_legendas WHERE producao=? ORDER BY cena',(pid,))])


def regenerate(db,ident,payload):
    part=payload.get('parte')
    index=payload.get('cena')
    allowed={'narracao':['narracao','montagem','legendas'],'broll':['broll','montagem','legendas'],'legendas':['legendas']}
    if part not in allowed or type(index) is not int:
        raise ValueError('Cena ou etapa inválida.')
    if not db.execute('SELECT 1 FROM cenas WHERE roteiro=? AND ordem=?',(ident,index)).fetchone():
        raise ValueError('Cena indisponível.')
    transition(db,ident,'em_producao',payload.get('comentario'))
    for stage in [*allowed[part],'finalizar']:
        db.execute("""UPDATE jobs SET state='queued',error=NULL WHERE id IN
           (SELECT job FROM producao_etapas WHERE producao=? AND etapa=? AND cena=?)""",(ident,stage,0 if stage=='finalizar' else index))
    db.execute("UPDATE producao_etapas SET inicio=NULL,fim=NULL WHERE producao=? AND job IN (SELECT id FROM jobs WHERE state='queued')",(ident,))
    db.execute("UPDATE producoes_video SET etapa='na_fila',fim=NULL WHERE id=?",(ident,))


def approve(db,ident,payload):
    if type(payload.get('rotulagem_ia')) is not bool or payload.get('revisado') is not True:
        raise ValueError('Confirme a revisão do vídeo e a rotulagem.')
    transition(db,ident,'aprovado_para_publicacao')
    db.execute('UPDATE producoes_video SET rotulagem_ia=? WHERE id=?',(payload['rotulagem_ia'],ident))
