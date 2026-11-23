"""Local Studio accounts, expiring sessions and live office presence."""
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from pathlib import Path

os.umask(0o077)
folder=Path('storage/studio')
folder.mkdir(exist_ok=True,parents=True)
db=sqlite3.connect(folder/'accounts.sqlite',timeout=5)
db.row_factory=sqlite3.Row
db.executescript("""
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,login TEXT UNIQUE,name TEXT,salt TEXT,password TEXT,admin INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user INTEGER,expires REAL);
CREATE TABLE IF NOT EXISTS visits(user INTEGER PRIMARY KEY,session TEXT,x REAL,y REAL,facing TEXT,seen REAL);
CREATE TABLE IF NOT EXISTS failures(login TEXT PRIMARY KEY,at REAL,count INTEGER);
""")


def digest(password,salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()


def create(p,admin=False):
    login=p['login'].strip().lower()
    name=p['name'].strip()
    if not re.fullmatch(r'[a-z0-9_.@-]{3,80}',login) or not 1<=len(name)<=40 or not 12<=len(p['password'])<=256:
        raise ValueError('Use um login de 3 a 80 caracteres, nome de até 40 e senha de 12 a 256 caracteres.')
    salt=secrets.token_hex(16)
    db.execute('INSERT INTO users(login,name,salt,password,admin) VALUES(?,?,?,?,?)',(login,name,salt,digest(p['password'],salt),int(admin)))


def handle(action,p):
    now=time.time()
    key=hashlib.sha256(p.get('token','').encode()).hexdigest()
    if action=='signin':
        login=p.get('login','').strip().lower()[:80]
        db.execute('DELETE FROM failures WHERE at<?',(now-900,))
        failure=db.execute('SELECT * FROM failures WHERE login=?',(login,)).fetchone()
        if failure and failure['at']>now-900 and failure['count']>=8:
            raise ValueError('Muitas tentativas. Tente novamente em quinze minutos.')
        u=db.execute('SELECT * FROM users WHERE login=?',(login,)).fetchone()
        proof=digest(p.get('password','')[:256],u['salt'] if u else '00'*16)
        if not u or not hmac.compare_digest(u['password'],proof):
            db.execute('INSERT INTO failures VALUES(?,?,1) ON CONFLICT(login) DO UPDATE SET count=CASE WHEN at>? THEN count+1 ELSE 1 END,at=excluded.at',(login,now,now-900))
            db.commit()
            raise ValueError('Login ou senha inválidos.')
        db.execute('DELETE FROM failures WHERE login=?',(login,))
        lifetime = 90 * 24 * 3600
        token=secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires<?',(now,))
        db.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),u['id'],now+lifetime))
        return {'token':token,'maxAge':lifetime}
    u=db.execute('SELECT u.id,u.name,u.admin FROM users u JOIN sessions s ON s.user=u.id WHERE s.token=? AND expires>?',(key,now)).fetchone()
    if not u:return {'status':401}
    if action=='session':return dict(u)
    if action=='signout':
        db.execute('DELETE FROM sessions WHERE token=?',(key,))
        db.execute('DELETE FROM visits WHERE session=?',(key,))
    elif action=='password':
        db.execute('BEGIN IMMEDIATE')
        account=db.execute('SELECT salt,password FROM users WHERE id=?',(u['id'],)).fetchone()
        password=p.get('password','')
        if not 12<=len(password)<=256 or not hmac.compare_digest(account['password'],digest(p.get('current','')[:256],account['salt'])):
            raise ValueError('Confira a senha atual e a nova senha.')
        salt=secrets.token_hex(16)
        db.execute('UPDATE users SET salt=?,password=? WHERE id=?',(salt,digest(password,salt),u['id']))
        db.execute('DELETE FROM sessions WHERE user=?',(u['id'],))
    elif action=='users' and u['admin']:
        return {'users':[dict(r) for r in db.execute('SELECT login,name,admin FROM users ORDER BY login')]}
    elif action=='create' and u['admin']:
        create(p)
    elif action=='presence':
        x,y=p['x'],p['y']
        if type(x) not in (float,int) or type(y) not in (float,int) or not 0<=x<29 or not 0<=y<14 or p.get('facing') not in ('up','down','left','right'):
            raise ValueError('Posição inválida.')
        if p.get('joining') and (x,y)==(12,5):
            occupied=[(r[0],r[1]) for r in db.execute('SELECT x,y FROM visits WHERE user!=? AND seen>?',(u['id'],now-20))]
            for a,b in [(12,5),(11,5),(13,5),(12,6),(11,6),(13,6)]:
                if all(abs(a-i)+abs(b-j)>.8 for i,j in occupied):
                    x,y=a,b
                    break
        db.execute('INSERT OR REPLACE INTO visits VALUES(?,?,?,?,?,?)',(u['id'],key,x,y,p['facing'],now))
        return {'people':[dict(r) for r in db.execute('SELECT u.id,u.name,v.x,v.y,v.facing FROM visits v JOIN users u ON u.id=v.user JOIN sessions s ON s.token=v.session WHERE seen>? AND s.expires>? AND u.id!=?',(now-20,now,u['id']))], 'me':dict(u),'position':{'x':x,'y':y}}
    else:return {'status':403}
    return {'ok':True}


if __name__=='__main__':
    action=sys.argv[1]
    if action=='bootstrap':
        if not sys.stdin.isatty():raise SystemExit('Use um terminal interativo da VPS.')
        data=dict(login=input('Login do administrador: '),name=input('Nome no escritório: '),password=getpass.getpass('Senha (mínimo 12 caracteres): '))
        if data['password']!=getpass.getpass('Confirme a senha: '):raise SystemExit('Senhas diferentes.')
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM users WHERE admin=1').fetchone():raise SystemExit('Administrador já cadastrado.')
        create(data,True);db.commit();print('Administrador cadastrado.')
    else:
        try:
            result=handle(action,json.load(sys.stdin));db.commit()
        except (ValueError,KeyError,TypeError,sqlite3.IntegrityError):
            db.rollback();result={'error':'Confira os dados ou tente novamente mais tarde.','status':400}
        print(json.dumps(result))
