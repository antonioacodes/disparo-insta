import unittest
from unittest.mock import patch

from studio.link_source import direct, source_url
from studio.presets import missing_caption_spans


class SourceTests(unittest.TestCase):
    def test_archive_links(self):
        for url, provider in [
            ("https://youtu.be/abcdefghijk", "Youtube"),
            ("https://www.twitch.tv/videos/12345", "TwitchVod"),
            ("https://kick.com/channel/videos/01a0251f-ef48-702d-9289-d66922da0e84", "KickVOD"),
            ("https://example.com/media.mp4", None),
        ]:
            self.assertEqual(source_url(url)[0], provider)

    def test_local_address(self):
        with self.assertRaises(ValueError):
            direct("https://127.0.0.1/video", None)

    def test_mixed_captions_within_one_phrase(self):
        with patch("studio.presets.shutil.which",return_value="tesseract"), patch(
            "studio.presets.run", side_effect=[b"frame", b"Fala", b"frame", b"",
                                               b"frame", b"", b"frame", b"Outra fala"]):
            self.assertEqual(missing_caption_spans("video.mp4", 5, 7), [(5.5, 6.5)])
