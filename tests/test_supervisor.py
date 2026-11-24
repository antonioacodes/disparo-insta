import sqlite3
import unittest
from unittest.mock import patch
from studio import roteiros, supervisor


class Supervisor(unittest.TestCase):
    def test_revision_scoped_to_content_and_model(self):
        db=sqlite3.connect(':memory:')
        roteiros.init(db)
        verdict=dict(parecer='devolver',positivo='Ritmo',problema='Legenda cortada',ajuste='Reposicionar')
        with patch.object(supervisor,'config',return_value={'GEMINI_API_KEY':'a,b,c'}),patch.object(supervisor,'evaluate',return_value=verdict) as evaluate:
            for title in ('A','A','B'):
                self.assertEqual(supervisor.review(db,'Roteiro','1',dict(title=title)),verdict)
            self.assertEqual(evaluate.call_count,2)
            self.assertEqual(len(supervisor.history(db)),2)

    def test_active_marker_only_during_call(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            db=sqlite3.connect(Path(tmp)/'studio.sqlite')
            try:
                with supervisor.reviewing(db,'Cena','roteiro:1',{}):
                    task,=supervisor.active(db)
                    self.assertEqual((task['agent'],task['stage']),('Bia','Roteiro · cena 1'))
                    raise RuntimeError('timeout')
            except RuntimeError:
                pass
            self.assertEqual(supervisor.active(db),[])
            db.close()

    def test_unconfigured_writes_no_tag(self):
        with patch.object(supervisor,'config',return_value={}):
            self.assertIsNone(supervisor.review(None,'Vídeo','1',{}))
