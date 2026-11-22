import os
import tempfile
import unittest


class EstimatesTest(unittest.TestCase):
    def test_analysis_then_previews(self):
        from studio.eta import estimates
        with tempfile.TemporaryDirectory() as folder:
            cwd = os.getcwd()
            os.chdir(folder)
            try:
                from studio.worker import db
                db.execute("INSERT INTO projects(id,title,media,duration) VALUES('p','P','f',300)")
                db.execute("INSERT INTO jobs(kind,entity,state) VALUES('analyze','p','running')")
                self.assertGreater(estimates(db)['p']['high'], estimates(db)['p']['low'])
                db.execute("UPDATE jobs SET state='done'")
                self.assertNotIn('p', estimates(db))
                for idx in range(2):
                    cid = 'c'+str(idx)
                    db.execute("INSERT INTO clips(id,project,start,end) VALUES(?,'p',0,45)", (cid,))
                    db.execute("INSERT INTO jobs(kind,entity,state) VALUES('preview',?,'queued')", (cid,))
                original = estimates(db)['p']['high']
                db.execute("UPDATE jobs SET state='done' WHERE entity='c0'")
                self.assertLess(estimates(db)['p']['high'], original)
            finally:
                os.chdir(cwd)
