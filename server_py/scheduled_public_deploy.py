from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any

from .public_deploy import publish_public_snapshot


def main() -> None:
    logs: list[str] = []

    def collect_log(line: str) -> None:
        logs.append(line)
        print(line, flush=True)

    try:
        result = publish_public_snapshot(collect_log)
    except Exception as error:
        payload: dict[str, Any] = {
            "ok": False,
            "error": str(error),
            "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "logs": logs,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)
        raise

    payload = {
        **result,
        "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
