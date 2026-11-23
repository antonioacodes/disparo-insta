"""YouTube clip suitability, from public counters captured at research time."""
import math
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def period(days, now):
    if days > 0:
        return {'publishedAfter': (now - timedelta(days=days)).isoformat()}
    midnight = now.astimezone(ZoneInfo('America/Sao_Paulo')).replace(hour=0,minute=0,second=0,microsecond=0)
    if days == 0:
        return {'publishedAfter':midnight.isoformat()}
    return {'publishedAfter':(midnight-timedelta(days=1)).isoformat(),'publishedBefore':midnight.isoformat()}


def duration(value):
    match=re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?',value or '')
    if match:
        return sum(int(n or 0)*factor for n,factor in zip(match.groups(),(86400,3600,60,1)))


def rank(db, items, now):
    for item in items:
        views=item.get('views')
        if views is None or not item.get('published'):
            continue
        views=int(views)
        age=max(1,(now-datetime.fromisoformat(item['published'].replace('Z','+00:00')).timestamp())/3600)
        rate=views/age
        vid=item.get('videoId')
        previous=db.execute('SELECT at,views FROM trend_samples WHERE video=? AND at BETWEEN ? AND ? ORDER BY at DESC LIMIT 1',
                            (vid,now-3*86400,now-3600)).fetchone()
        if previous and views>=previous['views']:
            hours=(now-previous['at'])/3600
            gain=views-previous['views']
            rate=gain/hours
            item.update(gain=gain,intervalHours=round(hours,1))
        if vid:
            db.execute('INSERT OR REPLACE INTO trend_samples VALUES(?,?,?)',(vid,int(now),views))
        # Saturation caps keep reach alone from overwhelming suitability for cutting.
        components=[(45,min(1,math.log1p(rate)/math.log1p(20000))),(10,1/(1+age/72))]
        seconds=item.get('seconds')
        if seconds is not None:
            components.append((25,min(1,seconds/900)))
        for key,weight,threshold in [('likes',12,.06),('comments',8,.005)]:
            if item.get(key) is not None:
                components.append((weight,min(1,int(item[key])/max(views,100)*1/threshold)))
        score=round(100*sum(w*v for w,v in components)/sum(w for w,_ in components))
        item.update(score=score,rate=round(rate),ageHours=round(age,1))
    items.sort(key=lambda i:(i.get('score',-1),i.get('rate',0)),reverse=True)
