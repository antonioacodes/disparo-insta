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
