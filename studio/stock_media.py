"""Stock media for approved scenes. Cache searches without storing credentials."""
import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

COMMONS = 'https://commons.wikimedia.org/w/api.php'
AGENT = 'DisparoInstaStudio/1.0 (https://painel.acodes.pro)'
LIMIT = 100 * 1024 * 1024


def keys(value):
    return list(dict.fromkeys(k.strip() for k in value.split(',') if k.strip()))


def search(cache, provider, endpoint, params, credentials=('',), as_query=False):
    digest = hashlib.sha256((provider + urlencode(params)).encode()).hexdigest()
    file = cache / (digest + '.json')
    if file.exists() and time.time() - file.stat().st_mtime < 86400:
        return json.loads(file.read_text())
    cooldown=cache/(provider+'.retry')
    if cooldown.exists() and cooldown.stat().st_mtime>time.time():
        return {}
    for key in credentials:
        headers = {'User-Agent': AGENT}
        query = dict(params)
        if as_query:
            query['key'] = key
        elif key:
            headers['Authorization'] = 'Token ' + key
        req = Request(endpoint + '?' + urlencode(query), headers=headers)
        try:
            with urlopen(req, timeout=20) as response:
                result = json.load(response)
        except HTTPError as exc:
            if exc.code == 429:
                delay=exc.headers.get('Retry-After') or exc.headers.get('X-RateLimit-Reset') or '3600'
                until=time.time()+(int(delay) if delay.isdigit() else 3600)
                cooldown.touch()
                os.utime(cooldown,(until,until))
                return {}
            invalid_pixabay = (provider == 'pixabay' and exc.code == 400 and b'key' in exc.read(1024).lower())
            if exc.code == 401 or invalid_pixabay:
                continue
            raise
        with tempfile.NamedTemporaryFile(mode='w',dir=cache,delete=False) as tmp:
            json.dump(result,tmp)
        os.replace(tmp.name,file)
        return result
    return {}


def fetch(cache, url, allowed, suffix):
    host = urlsplit(url)
    if host.scheme != 'https' or host.hostname not in allowed:
        return None
    path = cache / (hashlib.sha256(url.encode()).hexdigest() + suffix)
    if path.is_file():
        return path
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as tmp:
        try:
            with urlopen(Request(url,headers={'User-Agent':AGENT}),timeout=60) as response:
                if int(response.headers.get('Content-Length',0)) > LIMIT:
                    return None
                while chunk := response.read(65536):
                    if tmp.tell()+len(chunk)>LIMIT:
                        return None
                    tmp.write(chunk)
            if tmp.tell():
                tmp.flush()
                os.replace(tmp.name,path)
                return path
        finally:
            Path(tmp.name).unlink(missing_ok=True)


def pixabay(cfg, cache, term, vertical):
    data = search(cache,'pixabay','https://pixabay.com/api/videos/',
                  dict(q=term[:100],per_page=5,safesearch='true'),keys(cfg['PIXABAY_API_KEY']),True)
    hits = data.get('hits',[])
    def orientation(hit):
        file = hit['videos']['medium']
        return (file['height']>file['width']) == vertical
    for hit in sorted(hits,key=orientation,reverse=True):
        path = fetch(cache,hit['videos']['medium']['url'],{'cdn.pixabay.com','pixabay.com'},'.mp4')
        if path:
            return path,('Pixabay',str(hit['id']),hit['pageURL'],hit['user'],'https://pixabay.com/service/license-summary/')


def commons(cache, term, sound=False):
    kind='audio' if sound else 'video'
    data=search(cache,'commons',COMMONS,dict(action='query',format='json',generator='search',gsrnamespace=6,
        gsrsearch=f'{term} filetype:{kind}',gsrlimit=8,prop='imageinfo',iiprop='url|mime|extmetadata|size'))
    for page in sorted(data.get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',0)):
        info=page.get('imageinfo',[{}])[0]
        meta=info.get('extmetadata',{})
        license=meta.get('LicenseShortName',{}).get('value','')
        if license not in ('CC0','Public domain') or info.get('size',0)>LIMIT:
            continue
        mime=info.get('mime','')
        if not mime.startswith(kind+'/'):
            continue
        path=fetch(cache,info['url'],{'upload.wikimedia.org'},'.audio' if sound else '.video')
        if path:
            return path,('Wikimedia Commons',str(page['pageid']),info['descriptionurl'],
                         re.sub('<[^>]+>','',meta.get('Artist',{}).get('value','')),license)


def mixkit(cfg, term):
    if not cfg['MIXKIT_CATALOG']:
        return None
    catalog=Path(cfg['MIXKIT_CATALOG']).resolve()
    words=set(term.casefold().split())
    matches=[]
    for item in json.loads(catalog.read_text()):
        file=(catalog.parent/item['file']).resolve()
        score=len(words.intersection(' '.join(item['tags']).casefold().split()))
        if score and file.is_relative_to(catalog.parent) and file.is_file() and item.get('license')=='Free License':
            matches.append((score,file,item))
    if matches:
        _,file,item=max(matches,key=lambda m:m[0])
        return file,('Mixkit',file.name,item['url'],item.get('author','Mixkit'),'https://mixkit.co/license/modal/videoFree/')


def freesound(cfg,cache,term):
    data=search(cache,'freesound','https://freesound.org/apiv2/search/',
                dict(query=term,filter='license:"Creative Commons 0" duration:[4 TO 120]',
                     fields='id,url,username,license,previews',page_size=3),keys(cfg['FREESOUND_API_KEY']))
    for hit in data.get('results',[]):
        url=hit.get('previews',{}).get('preview-hq-mp3','')
        path=fetch(cache,url,{'cdn.freesound.org'},'.mp3')
        if path:
            return path,('Freesound',str(hit['id']),hit['url'],hit['username'],hit['license'])


def attempt(provider, function, *args):
    try:
        return function(*args)
    except (OSError, ValueError, KeyError, URLError) as exc:
        # Never log request URLs, which can contain a provider key.
        import logging
        logging.warning('Busca de mídia em %s indisponível (%s)',provider,getattr(exc,'code',type(exc).__name__))
        return None
