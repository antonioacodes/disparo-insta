import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from studio.preview_reviews import next_candidate

class PreviewReviews(unittest.TestCase):
    def test_backlog_and_retry_fairness(self):
        db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
        db.executescript('CREATE TABLE clips(id TEXT,project TEXT,state TEXT); CREATE TABLE audience(clip TEXT,result TEXT,model TEXT);')
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory);(work/'p').mkdir()
            for ident,state,report in [('missing','pending_review',{}),('approved','approved',{'geral':80}),('failed','pending_review',{'erro':'503','attempts':1,'retryAt':time.time()+600}),('done','pending_review',{'mentor':{'parecer':'favoravel'}}),('rejected','rejected',{})]:
                db.execute('INSERT INTO clips VALUES(?,?,?)',(ident,'p',state))
                db.execute('INSERT INTO audience VALUES(?,?,?)',(ident,json.dumps(report),'m'))
                if ident!='missing': (work/'p'/(ident+'-preview.mp4')).touch()
            self.assertEqual(next_candidate(db,work,'m',True)['id'],'approved')
            db.execute("UPDATE audience SET result=? WHERE clip='approved'",(json.dumps({'mentor':{'parecer':'favoravel'}}),))
            self.assertIsNone(next_candidate(db,work,'m',True))
            self.assertEqual(next_candidate(db,work,'m',True,'failed')['id'],'failed')
            db.execute("UPDATE audience SET result=? WHERE clip='failed'",(json.dumps({'erro':'503','attempts':3}),))
            self.assertIsNone(next_candidate(db,work,'m',True))
        db.close()
