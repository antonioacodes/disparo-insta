"""Measure the same Portuguese voiceover briefing under the production CPU/model locks."""
import argparse
import json
import time
import urllib.request
from pathlib import Path
from threading import Event, Thread

from studio.benchmark_trends import sample
from studio.model_slot import model_slot

PROMPT = """Escreva em português brasileiro um roteiro original de cento e trinta a cento e cinquenta palavras de narração sobre como planejar uma caminhada no bairro. Público iniciante. Sem nomes de pessoas ou estatísticas. Cinco cenas: gancho, contexto, escalada, virada e fechamento. Frases curtas. Números por extenso. Sem fontes fornecidas, marque dados factuais para verificar. Responda somente em JSON com cenas contendo tipo, narracao, fontes (lista) e verificar (booleano)."""


def swap_used():
    info = {k:int(v.split()[0]) for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines())}
    return (info['SwapTotal'] - info['SwapFree']) * 1024


def measure(model):
    import os
    from studio.worker import WORK, cpu_slot
    with cpu_slot(), model_slot(WORK):
        start = time.monotonic()
        baseline, peak = sample()
        peak_swap = initial_swap = swap_used()
        previous = baseline
        ticks = 0
        stop = Event()

        def monitor():
            nonlocal peak, peak_swap, ticks, previous
            while True:
                current,rss = sample()
                ticks += sum(max(0,value-previous.get(pid,0)) for pid,value in current.items())
                previous = current
                peak = max(peak,rss)
                peak_swap = max(peak_swap,swap_used())
                if stop.wait(.25):
                    return

        thread = Thread(target=monitor)
        thread.start()
        try:
            payload = dict(model=model,prompt=PROMPT,format='json',stream=False,keep_alive=0,
                           options=dict(num_gpu=0,num_thread=2,num_ctx=2048,num_predict=780,temperature=0))
            req = urllib.request.Request('http://127.0.0.1:11434/api/generate',json.dumps(payload).encode(),
                                         headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(req,timeout=3600) as response:
                result = json.load(response)
        finally:
            stop.set()
            thread.join()
        elapsed = time.monotonic() - start
        return dict(model=model,elapsed_s=round(elapsed,2),peak_rss_bytes=peak,
                    cpu_percent=round(100*ticks/os.sysconf('SC_CLK_TCK')/elapsed,1),
                    swap_before_bytes=initial_swap,swap_peak_bytes=peak_swap,
                    done_reason=result.get('done_reason'),response=result['response'])


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model')
    args=parser.parse_args()
    print(json.dumps(measure(args.model),ensure_ascii=False))
