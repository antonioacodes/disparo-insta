from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from unittest import TestCase, mock

from studio import stock_media as stock


class StockSearch(TestCase):
    def test_invalid_key_fallback_and_cache(self):
        keys = stock.keys('first, second,first, ')
        self.assertEqual(keys,['first','second'])
        failure=HTTPError('https://example.org',401,'Invalid key',{},None)
        with TemporaryDirectory() as folder, mock.patch.object(stock,'urlopen',side_effect=[failure,BytesIO(b'{"results":[]}')]) as get:
            args=(Path(folder),'test','https://example.org',{'q':'rain'},keys)
            self.assertEqual(stock.search(*args),stock.search(*args))
            self.assertEqual(get.call_count,2)
            self.assertEqual(get.call_args.args[0].get_header('Authorization'),'Token second')

    def test_quota_blocks_all_keys_and_terms(self):
        failure=HTTPError('https://example.org',429,'Quota',{'Retry-After':'60'},None)
        with TemporaryDirectory() as folder, mock.patch.object(stock,'urlopen',side_effect=failure) as get:
            for term in ('rain','forest'):
                self.assertEqual(stock.search(Path(folder),'test','https://example.org',{'q':term},['one','two']),{})
            self.assertEqual(get.call_count,1)
