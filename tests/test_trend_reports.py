import sqlite3
import unittest
from unittest.mock import patch

from studio import trends


class Reports(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        trends.init(self.db)
        config = dict.fromkeys(trends.KEYS, 'test')
        mock = patch.object(trends, 'settings', return_value=config)
        mock.start()
        self.addCleanup(mock.stop)
        self.addCleanup(self.db.close)

    def test_checkpoint_and_cached_request(self):
        ident = trends.submit(self.db, 'Jogos', 'BR', 7, 'YouTube')
        items = [dict(title='Jogo', creator='Canal', url=None)]
        with patch.object(trends, 'collect', return_value=items) as collect:
            trends.process(self.db, ident)
            partial, = trends.recent(self.db)
            self.assertEqual((partial['state'],partial['items']), ('Analisando',items))
            self.assertEqual(trends.submit(self.db,'jogos','BR',7,'YouTube'),ident)
            with patch.object(trends,'request',return_value={'response':'Resumo'}):
                trends.process(self.db,ident)
            collect.assert_called_once()
        self.assertEqual(trends.recent(self.db)[0]['analysis'],'Resumo')
        self.assertEqual(trends.submit(self.db,'Jogos','BR',7,'YouTube'),ident)

    def test_empty_search_finishes_without_inference(self):
        ident = trends.submit(self.db,'Lives','BR',1,'Twitch')
        with patch.object(trends,'collect',return_value=[]):
            trends.process(self.db,ident)
        report, = trends.recent(self.db)
        self.assertEqual(report['state'],'Concluída')
        self.assertIsNone(report['analysis'])
