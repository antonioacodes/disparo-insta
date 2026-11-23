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
    'em_producao': {'aguardando_revisao_video','erro'},
    'aguardando_revisao_video': {'aprovado_para_publicacao','em_producao'},
    'aprovado_para_publicacao': set(), 'publicado': set(),
    'rejeitado': set(), 'erro': {'rascunho','em_producao'},
}


def init(db):
    db.executescript("""
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
