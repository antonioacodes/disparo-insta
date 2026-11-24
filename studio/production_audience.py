"""Evaluate rendered scenes before a produced video reaches editorial review."""
import json
import re
import subprocess

from studio import roteiros

DIMENSIONS=('roteiro','cenas','imagens','narracao','legendas','montagem')


def evidence(path):
    # Sample luminance/contrast on the rendered picture and measure the mixed audio.
    picture=subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(path),
        '-vf','fps=1,scale=32:18,format=gray','-an','-f','rawvideo','pipe:1'],
        capture_output=True,check=True,timeout=900).stdout
    frames=[picture[i:i+576] for i in range(0,len(picture),576)]
    sound=subprocess.run(['ffmpeg','-nostdin','-hide_banner','-i',str(path),'-vn','-af',
        'volumedetect,silencedetect=noise=-45dB:d=0.5','-f','null','-'],
        capture_output=True,text=True,check=True,timeout=900).stderr
    return {'amostras_de_imagem':len(frames),'amostras_sem_contraste':sum(max(f)-min(f)<12 for f in frames),
            'nivel_medio_dB':re.findall(r'mean_volume: ([-.\d]+) dB',sound),
            'segundos_em_silencio':round(sum(map(float,re.findall(r'silence_duration: ([\d.]+)',sound))),2)}


def assess(db,work,pid,scenes,media):
    brief=json.loads(db.execute('SELECT b.dados FROM briefings b JOIN roteiros r ON b.id=r.briefing WHERE r.id=?',(pid,)).fetchone()[0])
    reports=[]
    for i,scene in enumerate(scenes):
        name=f'c{i:03d}'
        assets=[list(r) for r in db.execute('SELECT origem,url FROM assets_producao WHERE producao=? AND cena=?',(pid,i))]
        duration=db.execute('SELECT segundos FROM producao_legendas WHERE producao=? AND cena=?',(pid,i)).fetchone()[0]
        report=roteiros.generate(work,
            'Simule a recepção pelo público do briefing. Avalie os seis aspectos separadamente. '
            'Julgue roteiro e continuidade no contexto dos trechos vizinhos, coerência dos recursos com a cena, '
            'legibilidade das legendas e ritmo da narração. Baseie-se nas evidências. '
            'Você recebe medições e metadados, não assiste às imagens nem ouve as vozes. '
            'Retorne JSON {notas:{roteiro,cenas,imagens,narracao,legendas,montagem},problema,ajuste}. '
            'Cada nota é um inteiro de zero a cem. Descreva um problema concreto e uma correção aplicável.',
            dict(publico=brief['publico'],tom=brief['tom'],cena=scene,anterior=scenes[i-1]['narracao'][-200:] if i else '',
                 proxima=scenes[i+1]['narracao'][:200] if i+1<len(scenes) else '',creditos=assets,
                 legenda=(media/(name+'.srt')).read_text()[:1500],segundos=duration,
                 medidas=evidence(media/(name+'-leg.mp4'))))
        if not all(type(report['notas'].get(k)) is int and 0<=report['notas'][k]<=100 for k in DIMENSIONS):
            raise ValueError('Avaliação de cena incompleta.')
        for k in ('problema','ajuste'):
            roteiros.text(report[k],1500)
        reports.append(report)
    return reports


def score(reports):
    return sum(r['notas'][k] for r in reports for k in DIMENSIONS)/(len(reports)*len(DIMENSIONS))


def revise(work,scene,report,brief):
    change=roteiros.generate(work,'Reescreva a cena aplicando o ajuste solicitado. Preserve fatos, fontes, tom, '
        'duração e sentido. Use números por extenso na narração. Retorne JSON com narracao, estilo_visual, '
        'b_roll_busca (lista de buscas visuais em inglês), som_ambiente e legenda_destaque.',
        dict(cena=scene,avaliacao=report,briefing=brief))
    updated=dict(scene)
    for key in ('narracao','estilo_visual','legenda_destaque'):
        updated[key]=roteiros.text(change[key],3500)
    updated['som_ambiente']=str(change.get('som_ambiente',''))[:120]
    updated['b_roll_busca']=roteiros.strings(change['b_roll_busca'],True)
    if all(updated[k]==scene.get(k) for k in ('narracao','b_roll_busca','som_ambiente')):
        raise ValueError('A revisão não alterou os elementos renderizados.')
    return updated
