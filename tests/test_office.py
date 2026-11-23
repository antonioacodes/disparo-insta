import os
import subprocess
import sys
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path

from studio.office import agent_state, forecast, snapshot


class OfficeTest(unittest.TestCase):
    def test_worker_state_priority(self):
        for flags, state in [
            ((False, True, False, False), "Processador offline"),
            ((True, True, True, True), "Trabalhando"),
            ((True, False, True, True), "Esperando"),
            ((True, False, False, True), "Erro"),
            ((True, False, False, False), "Ocioso"),
        ]:
            self.assertEqual(agent_state(*flags), state)

    def test_prediction(self):
        self.assertIsNone(forecast(0, []))
        self.assertEqual(forecast(0, [90]), {"percent": 0, "remaining": 90})
        self.assertEqual(forecast(45, [60, 90, 120]), {"percent": 50, "remaining": 45})
        self.assertLess(forecast(100, [90])["percent"], 100)

    def test_queue_to_available_file(self):
        fixture = tempfile.TemporaryDirectory()
        self.addCleanup(fixture.cleanup)
        env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1]))
        subprocess.run([sys.executable, "-m", "studio.worker", "office"], cwd=fixture.name,
                       env=env, check=True, capture_output=True)
        conn = sqlite3.connect(Path(fixture.name)/"storage/studio/studio.sqlite")
        conn.row_factory = sqlite3.Row
        now = int(time.time())
        conn.execute("INSERT INTO projects(id,title,duration,media) VALUES('p','Vídeo',120,'v.mp4')")
        conn.execute("INSERT INTO clips(id,project,title,start,end,state) VALUES('c','p','Corte',0,30,'detected')")
        conn.execute("INSERT INTO jobs(kind,entity) VALUES('preview','c')")
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            self.assertEqual(snapshot(conn, work, True)["status"], "Esperando")
            conn.execute("UPDATE jobs SET state='running'")
            conn.execute("INSERT INTO job_progress VALUES(1,'Renderizando',?)", (now-15,))
            active = snapshot(conn, work, True)
            self.assertEqual(active["current"]["project"], "Vídeo")
            self.assertTrue(45 <= active["prediction"]["percent"] <= 55)
            conn.execute("UPDATE jobs SET state='done'")
            conn.execute("UPDATE clips SET state='pending_review'")
            self.assertFalse(snapshot(conn, work, True)["ready"])
            (work/"p").mkdir()
            (work/"p/c-preview.mp4").touch()
            result = snapshot(conn, work, True)
            self.assertEqual(len(result["finished"]), 1)
            self.assertEqual(result["ready"][0]["id"], "c")
            conn.execute("INSERT INTO preview_cache VALUES('c',?,1)", (now,))
            self.assertFalse(snapshot(conn, work, True)["ready"])
        conn.close()
