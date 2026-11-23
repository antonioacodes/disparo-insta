import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from studio.background import EditingPending, run_background


class BackgroundTest(unittest.TestCase):
    def test_edit_interrupts_an_active_process_and_releases_slot(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            database = work/'jobs.sqlite'
            conn = sqlite3.connect(database)
            conn.execute('CREATE TABLE jobs(state TEXT)')
            started = work/'started'
            def enqueue():
                with sqlite3.connect(database) as writer:
                    for _ in range(100):
                        if started.exists():
                            break
                        time.sleep(.02)
                    writer.execute("INSERT INTO jobs VALUES('queued')")
            thread = threading.Thread(target=enqueue)
            thread.start()
            with self.assertRaises(EditingPending):
                run_background(conn,work,[sys.executable,'-c',
                    "from pathlib import Path;import sys,time;Path(sys.argv[1]).touch();time.sleep(5)",str(started)])
            thread.join()
            self.assertTrue(started.is_file())
            with self.assertRaises(EditingPending):
                run_background(conn,work,['unreachable'])
            conn.execute("UPDATE jobs SET state='done'")
            run_background(conn,work,[sys.executable,'-c','pass'])
            conn.close()
