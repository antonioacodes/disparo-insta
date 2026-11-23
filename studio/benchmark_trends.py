"""Measure installed Ollama candidates on the Linux Studio VPS, one CPU thread at a time."""
import argparse
import sys
import json
import os
from pathlib import Path
import threading
import time
import urllib.request

PROMPT = """Você é analista de conteúdo. Dados fictícios de visualizações do mesmo vídeo em dias sucessivos:
A: 100, 200, 500. B: 400, 420, 430. C: apenas uma medição de 900.
Qual tem aceleração observável e qual não permite avaliar crescimento? Responda com JSON:
{"acelerando":"ID","insuficiente":"ID","motivo":"uma frase em português"}."""


def sample():
    ticks = {}
    rss = 0
    for proc in Path('/proc').glob('[0-9]*'):
        try:
            if not proc.joinpath('comm').read_text().strip().startswith('ollama'):
                continue
            fields = proc.joinpath('stat').read_text().rsplit(')', 1)[1].split()
            ticks[(proc.name, fields[19])] = int(fields[11])+int(fields[12])
            rss += int(proc.joinpath('statm').read_text().split()[1])*os.sysconf('SC_PAGE_SIZE')
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return ticks, rss


def measure(model):
    previous, peak = sample()
    ticks = 0
    stop = threading.Event()
    def monitor():
        nonlocal previous, peak, ticks
        while True:
            current, rss = sample()
            ticks += sum(max(0,value-previous.get(pid,0)) for pid,value in current.items())
            previous = current
            peak = max(peak,rss)
            if stop.wait(.25):
                break
    sampler = threading.Thread(target=monitor)
    start = time.monotonic()
    sampler.start()
    try:
        payload = dict(model=model,prompt=PROMPT,format='json',stream=False,keep_alive=0,
                       options=dict(num_gpu=0,num_thread=1,num_ctx=2048,num_predict=160,temperature=0))
        request = urllib.request.Request('http://127.0.0.1:11434/api/generate',json.dumps(payload).encode(),
                                         headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=900) as response:
            result = json.load(response)
    finally:
        stop.set()
        sampler.join()
    elapsed = time.monotonic()-start
    try:
        answer=json.loads(result['response'])
    except ValueError:
        answer={}
    return dict(modelo=model,segundos=round(elapsed,2),inferencia_s=round(result['eval_duration']/1e9,2),
                cpu_percentual_1_nucleo=round(100*ticks/os.sysconf('SC_CLK_TCK')/elapsed,1),
                pico_rss_ollama_mib=round(peak/1048576),resposta=answer,
                acertou_exemplo=isinstance(answer,dict) and answer.get('acelerando')=='A' and answer.get('insuficiente')=='C')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('modelos',nargs='+',help='Nomes dos modelos locais conforme ollama list')
    parser.add_argument('--measure-one',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.measure_one:
        print(json.dumps(measure(args.modelos[0]),ensure_ascii=False),flush=True)
    else:
        from studio.worker import WORK, db
        from studio.background import EditingPending, run_background
        for model in args.modelos:
            while True:
                try:
                    run_background(db,WORK,[sys.executable,'-m','studio.benchmark_trends','--measure-one',model])
                    break
                except EditingPending:
                    time.sleep(5)
