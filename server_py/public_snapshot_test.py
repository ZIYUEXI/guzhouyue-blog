"""验证导出分层、跨发布一致性与实际图片预算，全部使用临时目录。"""
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from .public_media import optimize_public_media
from .public_snapshot import write_versioned_snapshot


class PublicSnapshotTests(unittest.TestCase):
    def test_full_text_is_preserved_outside_the_homepage_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            article = {"slug": "正文-测试", "title": "测试", "tags": ["公式"], "body": ["旧正文"], "bodyMarkdown": "正文关键词\n\n```mermaid\ngraph TD; A-->B\n```"}
            payloads = {"site": {"homepage": {"siteName": "孤舟月"}}, "articles": {"items": [article]}, "gallery": {"items": []}}
            first = write_versioned_snapshot(root, payloads, "first")

            def read(url):
                return json.loads((root / url.removeprefix("/data/")).read_text(encoding="utf-8"))

            summary = read(first["resources"]["index"])["items"][0]
            self.assertNotIn("body", summary)
            self.assertNotIn("bodyMarkdown", summary)
            self.assertEqual(summary["tags"], article["tags"])
            self.assertEqual(read(first["articles"][article["slug"]])["bodyMarkdown"], article["bodyMarkdown"])
            self.assertEqual(read(first["resources"]["search"])["items"][0]["bodyMarkdown"], article["bodyMarkdown"])

            previous_url = first["articles"][article["slug"]]
            article["bodyMarkdown"] = "发布后的新正文"
            second = write_versioned_snapshot(root, payloads, "second")
            self.assertNotEqual(first["revision"], second["revision"])
            self.assertEqual(first["resources"]["index"], second["resources"]["index"])
            self.assertIn("正文关键词", read(previous_url)["bodyMarkdown"])
            self.assertEqual(read(second["articles"][article["slug"]])["bodyMarkdown"], "发布后的新正文")
            self.assertEqual(json.loads((root / "manifest.json").read_text())["revision"], second["revision"])

    def test_images_have_display_sizes_without_modifying_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = root / "public" / "images"
            images.mkdir(parents=True)
            for name in ["guzhouyue-hero.png", "guzhouyue-avatar.png"]:
                Image.new("RGB", (1672, 941), "#ede6d3").save(images / name)
            original = (images / "guzhouyue-hero.png").read_bytes()
            media = optimize_public_media(root, {"settings": {"stylePreset": "classic"}})
            self.assertIn("768w", media["hero"]["srcSet"])
            avatar = root / "public" / media["avatar"].lstrip("/")
            with Image.open(avatar) as image:
                self.assertEqual(image.size, (160, 160))
            self.assertLess(avatar.stat().st_size, 10000)
            self.assertEqual((images / "guzhouyue-hero.png").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
