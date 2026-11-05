"""按内容哈希导出快照，首页索引、单篇正文与全文搜索各自按需读取。"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def compact_json(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def write_versioned_snapshot(data_dir: Path, payloads: dict[str, Any], generated_at: str) -> dict[str, Any]:
    objects = data_dir / "objects"
    objects.mkdir(parents=True, exist_ok=True)

    def write_object(payload: Any) -> str:
        data = compact_json(payload)
        digest = hashlib.sha256(data).hexdigest()[:24]
        target = objects / f"{digest}.json"
        # 相同内容复用 URL，既有页面会话可继续读取已选定的发布版本。
        if not target.exists():
            target.write_bytes(data)
        return f"/data/objects/{target.name}"

    items = payloads["articles"].get("items", [])
    summaries = [{key: value for key, value in item.items() if key not in {"body", "bodyMarkdown"}} for item in items]
    search_items = [{key: value for key, value in item.items() if key != "body"} for item in items]
    resources = {key: write_object(value) for key, value in payloads.items() if key != "articles"}
    resources["index"] = write_object({"items": summaries})
    resources["search"] = write_object({"items": search_items})
    articles = {item["slug"]: write_object({key: value for key, value in item.items() if key != "body"}) for item in items}
    revision = hashlib.sha256(compact_json({"resources": resources, "articles": articles})).hexdigest()[:24]
    manifest = {"version": 1, "revision": revision, "generatedAt": generated_at, "resources": resources, "articles": articles}
    # 清单最后原子替换，构建时只会读取已经完整落盘的对象。
    temporary = data_dir / "manifest.json.tmp"
    temporary.write_bytes(compact_json(manifest))
    temporary.replace(data_dir / "manifest.json")
    return manifest
