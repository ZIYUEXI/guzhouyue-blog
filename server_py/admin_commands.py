from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from .content import list_articles, update_article
from .db import get_db


CommandHandler = Callable[[dict[str, Any], dict[str, Any]], Any]


@dataclass
class Command:
    name: str
    summary: str
    scope: str
    risk: str
    arguments: list[dict[str, Any]] = field(default_factory=list)
    confirmation_required: bool | None = None
    execute: CommandHandler | None = None


COMMANDS: dict[str, Command] = {}
COMMAND_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$")
OPTION_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
MAX_COMMAND_LENGTH = 2000


def register(command: Command) -> None:
    if not COMMAND_NAME_PATTERN.match(command.name):
        raise ValueError(f"Invalid admin command name: {command.name}")
    COMMANDS[command.name] = command


def descriptor(command: Command) -> dict[str, Any]:
    return {
        "name": command.name,
        "summary": command.summary,
        "scope": command.scope,
        "risk": command.risk,
        "arguments": command.arguments,
        "confirmationRequired": command.confirmation_required if command.confirmation_required is not None else command.risk == "high",
    }


def get_guide() -> dict[str, Any]:
    return {
        "pattern": "<domain>:<action>[.<subaction>] [target] [--key=value] [--flag]",
        "rules": [
            "指令名必须使用小写 ASCII，格式为 domain:action 或 domain:action.subaction。",
            "指令名后可以跟一个或多个位置参数，用于表达目标对象。",
            "选项使用 --key=value、--key value 或 --flag，key 只能包含小写字母、数字和连字符。",
            "包含空格的参数必须用单引号或双引号包裹，反斜杠可用于转义。",
            "框架只负责解析、鉴权、确认和分发；具体业务指令必须显式注册后才会执行。",
        ],
        "placeholderExamples": ["content:example target-slug --dry-run", 'ops:example --scope=site --reason="示例说明"'],
        "commands": [descriptor(command) for command in sorted(COMMANDS.values(), key=lambda item: item.name)],
    }


def tokenize(raw: str) -> tuple[list[str], list[str]]:
    tokens: list[str] = []
    errors: list[str] = []
    current = ""
    quote = ""
    escaped = False
    for character in raw:
        if escaped:
            current += character
            escaped = False
            continue
        if character == "\\":
            escaped = True
            continue
        if quote:
            if character == quote:
                quote = ""
            else:
                current += character
            continue
        if character in {"'", '"'}:
            quote = character
            continue
        if character.isspace():
            if current:
                tokens.append(current)
                current = ""
            continue
        current += character
    if escaped:
        current += "\\"
    if quote:
        errors.append("引号未闭合。")
    if current:
        tokens.append(current)
    return tokens, errors


def parse_admin_command(raw_input: Any) -> dict[str, Any]:
    raw = raw_input.strip() if isinstance(raw_input, str) else ""
    if not raw:
        return {"ok": False, "errors": ["指令不能为空。"], "tokens": []}
    if len(raw) > MAX_COMMAND_LENGTH:
        return {"ok": False, "errors": [f"指令不能超过 {MAX_COMMAND_LENGTH} 个字符。"], "tokens": []}
    tokens, errors = tokenize(raw)
    if errors:
        return {"ok": False, "errors": errors, "tokens": tokens}
    name = tokens[0] if tokens else ""
    parts = tokens[1:]
    if not COMMAND_NAME_PATTERN.match(name):
        errors.append("指令名格式无效，应为 domain:action 或 domain:action.subaction。")
    positional: list[str] = []
    options: dict[str, Any] = {}
    index = 0
    while index < len(parts):
        part = parts[index]
        if not part.startswith("--"):
            positional.append(part)
            index += 1
            continue
        option_text = part[2:]
        if "=" in option_text:
            key, value = option_text.split("=", 1)
        else:
            key = option_text
            if index + 1 < len(parts) and not parts[index + 1].startswith("--"):
                value = parts[index + 1]
                index += 1
            else:
                value = True
        if not OPTION_NAME_PATTERN.match(key):
            errors.append(f"选项名无效：{key or part}")
        else:
            _add_option_value(options, key, value)
        index += 1
    if errors:
        return {"ok": False, "errors": errors, "tokens": tokens}
    return {"ok": True, "invocation": {"raw": raw, "name": name, "positional": positional, "options": options}, "tokens": tokens}


def _add_option_value(options: dict[str, Any], key: str, value: Any) -> None:
    if key not in options:
        options[key] = value
    elif isinstance(options[key], list):
        options[key].append(str(value))
    else:
        options[key] = [str(options[key]), str(value)]


def run_admin_command(request: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_admin_command(request.get("input"))
    guide = get_guide()
    if not parsed.get("ok"):
        return {"status": "invalid", "errors": parsed["errors"], "guide": guide}
    invocation = parsed["invocation"]
    command = COMMANDS.get(invocation["name"])
    if not command:
        return {"status": "unknown_command", "invocation": invocation, "guide": guide}
    command_descriptor = descriptor(command)
    if request.get("dryRun") is True:
        return {"status": "dry_run", "invocation": invocation, "command": command_descriptor}
    if command_descriptor["confirmationRequired"] and request.get("confirm") is not True:
        return {"status": "confirmation_required", "invocation": invocation, "command": command_descriptor}
    try:
        result = command.execute(invocation, context) if command.execute else None
        return {"status": "executed", "invocation": invocation, "command": command_descriptor, "result": result}
    except Exception as error:
        return {"status": "failed", "invocation": invocation, "command": command_descriptor, "errors": [str(error) or "指令执行失败。"]}


def _option_text(invocation: dict[str, Any], key: str) -> str:
    value = invocation["options"].get(key)
    if isinstance(value, list):
        value = value[-1]
    return value.strip() if isinstance(value, str) else ""


def _article_id(invocation: dict[str, Any]) -> str:
    article_id = _option_text(invocation, "id") or (invocation["positional"][0].strip() if invocation["positional"] else "")
    if not article_id:
        raise ValueError("缺少文章 ID。")
    return article_id


def _parse_strict_command_date(value: str) -> str:
    text = value.strip()
    match = re.match(r"^(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$", text)
    if match:
        year, month, day, hour, minute = match.groups()
        date = datetime(int(year), int(month), int(day), int(hour or 0), int(minute or 0), tzinfo=timezone.utc)
        date = date.replace(tzinfo=timezone.utc).timestamp() - 8 * 60 * 60
        date = datetime.fromtimestamp(date, timezone.utc)
        return date.isoformat().replace("+00:00", "Z")
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat().replace("+00:00", "Z")
    except ValueError as error:
        raise ValueError(f"日期无效：{value}") from error


def _register_defaults() -> None:
    register(
        Command(
            name="article:list-ids",
            summary="获取当前全部文章的 ID 列表。",
            scope="articles",
            risk="low",
            execute=lambda _invocation, _context: {
                "count": len(list_articles({"page": 1, "pageSize": 1000, "includeDrafts": True})["items"]),
                "items": [
                    {"id": item["id"], "slug": item["slug"], "title": item["title"], "status": item["status"], "publishedAt": item["publishedAt"], "updatedAt": item["updatedAt"]}
                    for item in list_articles({"page": 1, "pageSize": 1000, "includeDrafts": True})["items"]
                ],
            },
        )
    )

    def get_content(invocation: dict[str, Any], _context: dict[str, Any]) -> dict[str, Any]:
        article_id = _article_id(invocation)
        with get_db() as conn:
            row = conn.execute(
                """
                SELECT a.id, a.slug, a.title, a.excerpt, a.status, a.published_at AS publishedAt,
                  a.updated_at AS updatedAt, a.body_markdown AS bodyMarkdown, ns.name AS category
                FROM articles a
                LEFT JOIN note_sections ns ON ns.id = a.category_id
                WHERE a.id = ? AND a.deleted_at IS NULL
                """,
                (article_id,),
            ).fetchone()
        if not row:
            raise ValueError(f"没有找到文章 ID：{article_id}")
        return {"article": dict(row)}

    register(
        Command(
            name="article:get-content",
            summary="获取指定 ID 文章的内容。",
            scope="articles",
            risk="low",
            arguments=[{"name": "id", "description": "文章 ID，作为第一个位置参数，也可用 --id 指定。", "required": True, "type": "string"}],
            execute=get_content,
        )
    )

    def set_title(invocation: dict[str, Any], _context: dict[str, Any]) -> dict[str, Any]:
        article_id = _article_id(invocation)
        title = _option_text(invocation, "title") or " ".join(invocation["positional"][1:]).strip()
        if not title:
            raise ValueError('缺少新标题，请使用 article:set-title <id> --title="新标题"。')
        if len(title) > 120:
            raise ValueError("文章标题不能超过 120 个字符。")
        article = update_article(article_id, {"title": title})
        if not article:
            raise ValueError(f"没有找到文章 ID：{article_id}")
        return {"ok": True, "article": {"id": article["id"], "slug": article["slug"], "title": article["title"], "updatedAt": article["updatedAt"]}}

    register(
        Command(
            name="article:set-title",
            summary="修改指定 ID 文章的标题。",
            scope="articles",
            risk="medium",
            arguments=[
                {"name": "id", "description": "文章 ID，作为第一个位置参数，也可用 --id 指定。", "required": True, "type": "string"},
                {"name": "title", "description": "新的文章标题，建议使用 --title=\"新标题\" 指定。", "required": True, "type": "string"},
            ],
            execute=set_title,
        )
    )

    def set_date(invocation: dict[str, Any], _context: dict[str, Any]) -> dict[str, Any]:
        target = _option_text(invocation, "article") or _option_text(invocation, "slug") or (invocation["positional"][0].strip() if invocation["positional"] else "")
        if not target:
            raise ValueError('缺少文章标识，请使用 article:set-date <slug-or-id> --date="2026.06.09 18:30"。')
        date_text = _option_text(invocation, "date") or " ".join(invocation["positional"][1:]).strip()
        if not date_text:
            raise ValueError('缺少目标日期，请使用 --date="2026.06.09 18:30"。')
        article = update_article(target, {"publishedAt": _parse_strict_command_date(date_text)})
        if not article:
            raise ValueError(f"没有找到文章：{target}")
        return {"ok": True, "article": {"id": article["id"], "slug": article["slug"], "title": article["title"], "date": article["date"], "publishedAt": article["publishedAt"], "updatedAt": article["updatedAt"]}}

    register(
        Command(
            name="article:set-date",
            summary="修改指定文章的发布日期。",
            scope="articles",
            risk="medium",
            arguments=[
                {"name": "target", "description": "文章 slug 或 id，作为第一个位置参数，也可用 --article 指定。", "required": True, "type": "string"},
                {"name": "date", "description": "目标日期，未带时区时按北京时间解析，支持 2026.06.09、2026.06.09 18:30 或 ISO 日期。", "required": True, "type": "string"},
            ],
            execute=set_date,
        )
    )


_register_defaults()
