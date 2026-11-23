from datetime import datetime, timezone
from studio.trend_ranking import rank, duration, period
from io import BytesIO
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
        items = [dict(title='Jogo', creator='Canal', videoId='sample', url=None)]
        with patch.object(trends, 'collect', return_value=items) as collect:
            trends.process(self.db, ident)
            partial, = trends.recent(self.db)
            self.assertEqual((partial['state'],partial['items']), ('Analisando',items))
            self.assertEqual(trends.submit(self.db,'jogos','BR',7,'YouTube'),ident)
            with patch('urllib.request.urlopen',return_value=BytesIO(b'{"response":"Resumo","done":false}\n{"done":true}\n')):
                trends.process(self.db,ident)
            collect.assert_called_once()
        self.assertEqual(trends.recent(self.db)[0]['analysis'],'Resumo')
        self.assertEqual(trends.recent(self.db)[0]['progress']['stage'],3)
        self.assertEqual(trends.submit(self.db,'Jogos','BR',7,'YouTube'),ident)

    def test_empty_search_finishes_without_inference(self):
        ident = trends.submit(self.db,'Lives','BR',1,'Twitch')
        with patch.object(trends,'collect',return_value=[]):
            trends.process(self.db,ident)
        report, = trends.recent(self.db)
        self.assertEqual(report['state'],'Concluída')
        self.assertIsNone(report['analysis'])

    def test_recent_velocity_and_clip_length(self):
        now=datetime(2026,11,23,15,tzinfo=timezone.utc)
        first=dict(videoId='long',views=500000,likes=30000,comments=1800,seconds=1800,published='2026-11-22T15:00:00Z')
        old=dict(videoId='short',views=600000,seconds=40,published='2026-11-01T15:00:00Z')
        items=[old,first]
        rank(self.db,items,now.timestamp())
        self.assertEqual(items[0]['videoId'],'long')
        self.assertNotIn('gain',first)
        first['views']+=4000
        rank(self.db,[first],now.timestamp()+7200)
        self.assertEqual((first['rate'],first['gain']),(2000,4000))
        self.assertEqual(duration('PT1H10M2S'),4202)
        self.assertEqual(period(-1,now)['publishedBefore'],period(0,now)['publishedAfter'])

    def test_cancel_is_terminal_and_required_before_deletion(self):
        ident=trends.submit(self.db,'Tema','BR',3,'YouTube')
        self.assertIn('error',trends.manage(self.db,ident,'delete'))
        self.assertTrue(trends.manage(self.db,ident,'cancel')['ok'])
        with patch.object(trends,'collect') as collect:
            trends.process(self.db,ident)
            collect.assert_not_called()
        self.assertEqual(trends.recent(self.db)[0]['state'],'Interrompida')
        self.assertTrue(trends.manage(self.db,ident,'delete')['ok'])
        self.assertEqual(trends.recent(self.db),[])
