import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from studio import activity_review


class ActivityDecisions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name)
        env=dict(os.environ,PYTHONPATH=str(Path(__file__).resolve().parents[1]))
        subprocess.run([sys.executable,'-m','studio.worker','office'],cwd=self.base,env=env,check=True,capture_output=True)
        self.work=self.base/'storage/studio'
        self.db=sqlite3.connect(self.work/'studio.sqlite',isolation_level=None)
        self.addCleanup(self.db.close)
        self.db.execute("INSERT INTO projects(id,title,media) VALUES('p','Projeto','original.mp4')")
        self.db.execute("INSERT INTO clips(id,project,title,state) VALUES('c','p','Corte','pending_review')")
        (self.work/'p').mkdir()
        self.preview=self.work/'p/c-preview.mp4'
        self.preview.touch()

    def decide(self,approve):
        activity_review.decide(self.db,self.work,Mock(),'preview','c',approve,{})

    def test_repeated_approval_queues_one_export(self):
        self.decide(True)
        self.decide(True)
        self.assertEqual(self.db.execute("SELECT count(*) FROM jobs WHERE kind='final'").fetchone()[0],1)
        with self.assertRaises(ValueError):
            self.decide(False)
        self.assertTrue(self.preview.exists())

    def test_delete_only_preview(self):
        original=self.work/'p/original.mp4'
        original.touch()
        self.decide(False)
        self.assertFalse(self.preview.exists())
        self.assertTrue(original.exists())

    def test_choose_most_viewed_and_preserve_preset(self):
        items=[dict(title=str(i),views=i,url='https://youtu.be/abcdefghij'+str(i)) for i in range(3)]
        self.db.execute("INSERT INTO trend_reports(id,query,state,items) VALUES(1,'Jogos','Concluída',?)",(json.dumps(items),))
        create=Mock()
        options=dict(mode='views',count=2,preset={'format':'vertical'})
        for _ in range(2):
            activity_review.decide(self.db,self.work,create,'trend','1',True,options)
        self.assertEqual([c.args[1] for c in create.call_args_list],['2','1'])
        self.assertEqual(json.loads(create.call_args.args[2]),options['preset'])
