import json
import tempfile
import unittest
from pathlib import Path

from server import humanize_title, scan_library


class ScannerHelpers:
    @staticmethod
    def build_library(root):
        # library/Samples/Dreams/dreams.mp3+srt+txt
        dreams = root / "library" / "Samples" / "Dreams"
        dreams.mkdir(parents=True)
        (dreams / "dreams.mp3").touch()
        (dreams / "dreams.srt").touch()
        (dreams / "dreams.txt").write_text("What are dreams?\n", encoding="utf-8")

        # library/Samples/direct.mp3+srt  -> source-level item, no collection
        solo = root / "library" / "Samples"
        (solo / "direct.mp3").touch()
        (solo / "direct.srt").touch()

        # library/Podcasts/BBC/2025-01-01-the-future.mp3+srt  -> humanized title, no txt
        bbc = root / "library" / "Podcasts" / "BBC"
        bbc.mkdir(parents=True)
        (bbc / "2025-01-01-the-future-of-ai.mp3").touch()
        (bbc / "2025-01-01-the-future-of-ai.srt").touch()

        # an mp3 with no matching srt -> ignored
        (bbc / "transcript-only.mp3").touch()

        # an srt with no matching mp3 -> ignored
        (bbc / "audio-only.srt").touch()


class ScanLibraryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        ScannerHelpers.build_library(self.root)

    def sources(self):
        return scan_library(self.root)["sources"]

    def find_source(self, name):
        for source in self.sources():
            if source["id"] == name:
                return source
        self.fail(f"source not found: {name}")

    def test_groups_three_layers(self):
        source = self.find_source("Samples")
        collections = {col["id"]: col for col in source["collections"]}
        self.assertIn("Dreams", collections)
        items = collections["Dreams"]["items"]
        self.assertEqual([item["id"] for item in items], ["dreams"])

    def test_source_level_item_has_no_collection(self):
        source = self.find_source("Samples")
        self.assertEqual([item["id"] for item in source["items"]], ["direct"])

    def test_stem_txt_title_override(self):
        source = self.find_source("Samples")
        item = source["collections"][0]["items"][0]
        self.assertEqual(item["title"], "What are dreams?")

    def test_humanized_title_with_date_stripped(self):
        source = self.find_source("Podcasts")
        collection = source["collections"][0]
        item = collection["items"][0]
        self.assertEqual(item["id"], "2025-01-01-the-future-of-ai")
        self.assertEqual(item["title"], "The Future Of Ai")

    def test_lone_files_ignored(self):
        source = self.find_source("Podcasts")
        collection = source["collections"][0]
        self.assertEqual(len(collection["items"]), 1)

    def test_paths_are_root_relative(self):
        source = self.find_source("Samples")
        item = source["collections"][0]["items"][0]
        self.assertEqual(item["audio"], "library/Samples/Dreams/dreams.mp3")
        self.assertEqual(item["transcript"], "library/Samples/Dreams/dreams.srt")
        self.assertTrue(item["available"])

    def test_missing_library_dir_returns_empty(self):
        empty = Path(tempfile.mkdtemp()) / "nope"
        result = scan_library(empty)
        self.assertEqual(result, {"sources": []})


class TopLevelItemTest(unittest.TestCase):
    def test_item_at_library_root_uses_fallback_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "library").mkdir()
            (root / "library" / "loose.mp3").touch()
            (root / "library" / "loose.srt").touch()
            sources = scan_library(root)["sources"]
            self.assertEqual(len(sources), 1)
            self.assertEqual(sources[0]["id"], "library")
            self.assertEqual([item["id"] for item in sources[0]["items"]], ["loose"])


class HumanizeTitleTest(unittest.TestCase):
    def test_dashes_and_underscores_coalesced(self):
        self.assertEqual(humanize_title("why-do_we-dream"), "Why Do We Dream")

    def test_leading_number_stripped(self):
        self.assertEqual(humanize_title("01-intro"), "Intro")

    def test_empty_falls_back_to_stem(self):
        self.assertEqual(humanize_title("12345"), "12345")


if __name__ == "__main__":
    unittest.main()
