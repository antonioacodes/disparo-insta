import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


class OfficeUsers(unittest.TestCase):
    def test_auth_private_accounts_and_presence(self):
        with tempfile.TemporaryDirectory() as temp:
            env=dict(os.environ,PYTHONPATH=str(Path(__file__).resolve().parents[1]))
            def call(action,**data):
                result=subprocess.run([sys.executable,'-m','studio.accounts',action],input=json.dumps(data),
                       text=True,env=env,cwd=temp,capture_output=True,check=True)
                return json.loads(result.stdout)
            self.assertEqual(call('create',name='A',login='aaa',password='teste-seguro-admin')['status'],401)
            subprocess.run([sys.executable,'-c',"from studio.accounts import create,db;create(dict(name='Admin',login='admin',password='teste-seguro-admin'),True);db.commit()"],cwd=temp,env=env,check=True)
            token=call('signin',login='admin',password='teste-seguro-admin')['token']
            self.assertTrue(call('create',token=token,name='Ana',login='ana',password='outra-senha-de-teste')['ok'])
            ana=call('signin',login='ana',password='outra-senha-de-teste')['token']
            self.assertEqual(call('users',token=ana)['status'],403)
            pos=dict(x=12,y=5,facing='up',joining=True)
            call('presence',token=token,**pos)
            presence=call('presence',token=ana,**pos)
            self.assertEqual(presence['people'][0]['name'],'Admin')
            self.assertNotEqual(presence['position'],{'x':12,'y':5})
            call('signout',token=token)
            self.assertEqual(call('session',token=token)['status'],401)
            self.assertFalse(call('presence',token=ana,**pos)['people'])
