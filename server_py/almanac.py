from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import SERVER_DIR, config


_cache: dict[str, Any] | None = None


def get_today_almanac() -> dict[str, Any]:
    return get_almanac(datetime.now().strftime("%Y-%m-%d"))


def get_almanac(date: str) -> dict[str, Any]:
    global _cache
    if _cache and _cache.get("date") == date:
        return _cache["payload"]
    script_path = Path(SERVER_DIR / "scripts" / "cnlunar_almanac.py")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    result = subprocess.run(
        [config.python_command, str(script_path), date],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=config.almanac_timeout_ms / 1000,
        check=True,
    )
    payload = _normalize_almanac(json.loads(result.stdout))
    _cache = {"date": date, "payload": payload}
    return payload


def _normalize_almanac(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": _text(value.get("date")),
        "weekDay": _text(value.get("weekDay")),
        "lunarYear": _text(value.get("lunarYear")),
        "lunarMonth": _text(value.get("lunarMonth")),
        "lunarDay": _text(value.get("lunarDay")),
        "zodiac": _text(value.get("zodiac")),
        "solarTerm": _text(value.get("solarTerm")),
        "nextSolarTerm": _text(value.get("nextSolarTerm")),
        "nextSolarTermDate": _text(value.get("nextSolarTermDate")),
        "dayGanzhi": _text(value.get("dayGanzhi")),
        "monthGanzhi": _text(value.get("monthGanzhi")),
        "yearGanzhi": _text(value.get("yearGanzhi")),
        "zodiacClash": _text(value.get("zodiacClash")),
        "levelName": _text(value.get("levelName")),
        "goodThings": [_text(item) for item in value.get("goodThings", []) if _text(item)],
        "badThings": [_text(item) for item in value.get("badThings", []) if _text(item)],
        "source": "cnlunar",
    }


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""
