import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from studio import roteiros, producao


class RoteirosTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        self.env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1]))
        self.call_office()
        self.db = sqlite3.connect(self.folder/'storage/studio/studio.sqlite', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.brief = dict(titulo_provisorio='O guarda-chuva', formato='shorts', tom='leve',
                          publico='adultos', nicho='ficção', duracao_alvo_segundos=45,
                          estrutura=['gancho'], fontes_de_pesquisa=[], restricoes=[])
        self.ident = roteiros.create(self.db, self.brief)

    def call_office(self):
        subprocess.run([sys.executable, '-m', 'studio.worker', 'office'], cwd=self.folder,
                       env=self.env, capture_output=True, check=True)

    def test_office_is_read_only(self):
        self.call_office()
        self.assertEqual(self.db.execute('SELECT count(*) FROM jobs').fetchone()[0], 0)

    def test_approval_gates(self):
        with patch.object(producao, 'check_space'), self.assertRaises(ValueError):
            roteiros.command(self.db, 'produzir', self.ident, {})
        with self.assertRaises(ValueError):
            roteiros.transition(self.db, self.ident, 'publicado')
        roteiros.transition(self.db, self.ident, 'aguardando_aprovacao')
        with self.assertRaises(ValueError):
            roteiros.command(self.db, 'aprovar', self.ident, {})
        roteiros.command(self.db, 'aprovar', self.ident, {'revisado': True})
        with patch.object(producao, 'check_space'):
            roteiros.command(self.db, 'produzir', self.ident, {})
        self.assertEqual(self.db.execute('SELECT count(*) FROM jobs').fetchone()[0], 1)
        with self.assertRaises(ValueError):
            roteiros.command(self.db, 'aprovar-video', self.ident, {'revisado':True, 'rotulagem_ia':True})
        self.assertFalse(roteiros.TRANSITIONS['aprovado_para_publicacao'])

    def test_validation(self):
        with self.assertRaises(ValueError):
            roteiros.validate_brief(dict(self.brief,duracao_alvo_segundos=-1))
        with self.assertRaises(ValueError):
            roteiros.validate_script({'cenas':[]},self.brief)

    def test_heartbeat_and_retry(self):
        roteiros.enqueue(self.db, self.ident, 'planejamento')
        job=self.db.execute('SELECT id FROM jobs').fetchone()[0]
        self.db.execute("UPDATE jobs SET state='running' WHERE id=?",(job,))
        self.assertEqual(roteiros.overview(self.db)['status'],'Interrompido')
        self.db.execute("INSERT INTO agentes_eventos(agente,job,evento,instante) VALUES('Roteiros',?,'heartbeat',?)",(job,time.time()))
        self.assertEqual(roteiros.overview(self.db)['status'],'Trabalhando')
        self.db.execute("UPDATE jobs SET state='done'")
        roteiros.enqueue(self.db,self.ident,'escrita')
        self.db.execute("UPDATE jobs SET state='failed' WHERE id<>?",(job,))
        roteiros.transition(self.db,self.ident,'erro')
        roteiros.command(self.db,'retomar',self.ident,{})
        self.assertEqual([r[0] for r in self.db.execute('SELECT state FROM jobs ORDER BY id')],['done','queued'])

    def test_shared_cpu_lock(self):
        import fcntl
        with (self.folder/'storage/studio/cpu.lock').open('a') as held:
            fcntl.flock(held,fcntl.LOCK_EX)
            with subprocess.Popen([sys.executable,'-c',
                "from studio.worker import cpu_slot; print('esperando',flush=True); "
                "slot=cpu_slot(); slot.__enter__(); print('entrou',flush=True); slot.__exit__(None,None,None)"],
                cwd=self.folder,env=self.env,stdout=subprocess.PIPE,text=True) as proc:
                self.assertEqual(proc.stdout.readline().strip(),'esperando')
                try:
                    with self.assertRaises(subprocess.TimeoutExpired):
                        proc.wait(timeout=.15)
                finally:
                    fcntl.flock(held,fcntl.LOCK_UN)
                self.assertEqual(proc.communicate(timeout=5)[0].strip(),'entrou')

    def test_complete_pipeline_with_simulated_providers(self):
        self.run_production([80,80])

    def test_low_score_corrected_then_approved(self):
        self.run_production([79,80,80])

    def test_five_failed_assessments_discard(self):
        self.run_production([79]*5)

    def test_automatic_brief_starts_generation(self):
        with patch.object(roteiros,'config',return_value={'ROTEIRO_MODELO':'test'}):
            result=roteiros.command(self.db,'briefing','',dict(self.brief,aprovacao_automatica=True))
        self.assertEqual(self.db.execute('SELECT entity FROM jobs').fetchone()[0],result['id']+':planejamento:0')
        self.assertFalse(roteiros.validate_brief(self.brief)['aprovacao_automatica'])
        with self.assertRaises(ValueError):
            roteiros.validate_brief(dict(self.brief,aprovacao_automatica='false'))

    def test_automatic_pipeline_still_waits_for_final_review(self):
        self.run_production([80,80],auto=True)

    def run_production(self,grades,auto=False):
        import wave
        if auto:
            import json
            self.db.execute('UPDATE briefings SET dados=?',(json.dumps(dict(self.brief,aprovacao_automatica=True)),))
        responses=[
            {'cenas':[{'tipo':'gancho','objetivo':'encontrar o objeto','duracao_segundos':3}]},
            {'narracao':'O guarda-chuva ficou aqui.', 'resumo':'O encontro.',
             'legenda_destaque':'O guarda-chuva','estilo_visual':'parque','fontes':[],'verificar':True},
            {'termos':['yellow umbrella']},{'valor':['Guarda-chuva']},{'valor':['Um encontro']},
            {'valor':'Uma história curta.'},{'valor':['ficção']}
        ]
        def next_job():
            job=self.db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY id LIMIT 1").fetchone()
            if job:
                self.db.execute("UPDATE jobs SET state='running' WHERE id=?",(job['id'],))
            return job

        def finish(job):
            self.db.execute("UPDATE jobs SET state='done' WHERE id=?",(job['id'],))

        with patch.object(producao,'check_space'), patch.object(roteiros,'generate',side_effect=responses) as model:
            roteiros.enqueue(self.db,self.ident,'planejamento')
            while job:=next_job():
                if job['kind']!='roteiro':
                    self.db.execute("UPDATE jobs SET state='queued' WHERE id=?",(job['id'],))
                    break
                roteiros.stage(self.db,self.folder,job)
                finish(job)
            self.assertEqual(model.call_count,len(responses))
        self.assertEqual(roteiros.command(self.db,'list','',{})[0]['status'],'em_producao' if auto else 'aguardando_aprovacao')
        if not auto:
            roteiros.command(self.db,'aprovar',self.ident,{'revisado':True})
        voice=self.folder/'voice.onnx'
        voice.touch()
        def piper(args,**options):
            with wave.open(args[-1],'wb') as stream:
                stream.setparams((1,2,16000,0,'NONE',''))
                stream.writeframes(bytes(2*16000*3))
        def render(args,folder):
            self.assertIn(Path(args[-1]).suffix, ('.mp4','.wav'))
            (folder/args[-1]).touch()
        cfg={'DIRETORIO_PRODUCAO':str(self.folder/'out'),'ESPACO_MINIMO_GB':'0',
             'PIPER_MODEL_PATH':str(voice),'AMBIENCIA':'off'}
        reports=[[dict(notas={k:grade for k in producao.audience.DIMENSIONS},problema='Teste',ajuste='Teste')] for grade in grades]
        with patch.object(producao.audience,'revise',side_effect=lambda work,scene,*args:{**scene,'narracao':scene['narracao']+' Sim.'}), patch.object(producao.audience,'assess',side_effect=reports), patch.object(producao,'config',return_value=cfg), patch.object(producao,'visual',return_value=None) as broll, patch.object(producao.subprocess,'run',side_effect=piper) as narration, patch.object(producao,'ffmpeg',side_effect=render):
            if not auto:
                roteiros.command(self.db,'produzir',self.ident,{})
            while job:=next_job():
                producao.process(self.db,self.folder,job)
                finish(job)
            report=producao.review(self.db,self.ident)
            if grades[-1]<80:
                self.assertFalse(report['pronto'])
                self.assertEqual(len(report['publico']),5)
                self.assertFalse((producao.root()/self.ident/'final.mp4').exists())
                self.assertEqual(roteiros.command(self.db,'list','',{})[0]['status'],'descartado')
                return
            self.assertTrue(report['pronto'])
            self.assertEqual(roteiros.command(self.db,'list','',{})[0]['status'],'aguardando_revisao_video')
            self.assertIn('00:00:03,000',report['legendas'][0]['srt'])
            roteiros.command(self.db,'regenerar',self.ident,dict(cena=0,parte='legendas',comentario='Revisão'))
            stages=[]
            while job:=next_job():
                stages.append(job['entity'].split(':')[1])
                producao.process(self.db,self.folder,job)
                finish(job)
            self.assertEqual(stages,['legendas','finalizar','publico'])
            self.assertEqual(broll.call_count,len(grades)-1)
            self.assertEqual(narration.call_count,len(grades)-1)
            roteiros.command(self.db,'aprovar-video',self.ident,dict(rotulagem_ia=True,revisado=True))
            self.assertTrue((producao.root()/self.ident/'final.mp4').is_file())
            self.assertEqual(roteiros.command(self.db,'list','',{})[0]['status'],'aprovado_para_publicacao')
            self.assertIsNone(next_job())

    def test_live_progress_follows_checkpoint_and_times_the_current_scene(self):
        import json
        now=time.time()
        roteiros.enqueue(self.db,self.ident,'planejamento')
        self.db.execute("UPDATE roteiro_etapas SET resultado=?,inicio=?,fim=?",(json.dumps([{},{}]),now-80,now-70))
        self.db.execute("UPDATE jobs SET state='done'")
        roteiros.enqueue(self.db,self.ident,'escrita',0)
        self.db.execute("UPDATE roteiro_etapas SET resultado='{}',inicio=?,fim=? WHERE etapa='escrita'",(now-70,now-10))
        self.db.execute("UPDATE jobs SET state='done'")
        roteiros.enqueue(self.db,self.ident,'escrita',1)
        job=self.db.execute('SELECT MAX(id) FROM jobs').fetchone()[0]
        self.db.execute("UPDATE jobs SET state='running' WHERE id=?",(job,))
        self.db.execute("UPDATE roteiro_etapas SET inicio=? WHERE job=?",(now-10,job))
        self.db.execute("INSERT INTO agentes_eventos(agente,job,evento,instante) VALUES('Roteiros',?,'heartbeat',?)",(job,now))
        task=roteiros.overview(self.db)['progress']
        self.assertEqual((task['done'],task['total']),(2,10))
        self.assertIn('cena 2 de 2',task['label'])
        self.assertAlmostEqual(task['stageRemaining'],50,delta=1)
        self.assertIsNone(task['remaining'])
        self.db.execute("UPDATE agentes_eventos SET instante=?",(now-100,))
        self.assertIsNone(roteiros.overview(self.db)['progress']['stageRemaining'])
