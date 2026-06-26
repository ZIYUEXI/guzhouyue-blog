# admin_commands.py

> 源路径：`server_py/admin_commands.py`
> 总行数：约 518 行

实现"管理员指令通道"：注册指令、tokenizer 解析、风险/确认元数据、`run_admin_command` 调度，以及一组内置的 `article:*` 指令。

## 文件概览

`admin_commands.py` 是 `/api/admin/commands/parse` 和 `/api/admin/commands/run` 两个端点的执行核心。它解决的问题是：让管理员或 AI Agent 用一行自然风格文本（如 `article:set-date test-post --date="2026.06.09 18:30"`）就能执行后台操作，同时保证：

1. **指令名规范**：必须匹配 `domain:action[.subaction]` 格式，避免乱起名。
2. **解析严谨**：tokenizer 支持引号、转义、`--key=value` / `--key value` / `--flag`。
3. **风险分级**：每条指令声明 `low`/`medium`/`high` 风险，`high` 默认需要二次确认。
4. **执行隔离**：未注册指令不会执行；未知/失败/dry-run/confirmation 都有明确状态码。
5. **北京时间**：所有日期默认按北京时区解析，转 UTC 后落库。

文件分四块：Command 注册框架、tokenizer/parser、调度执行、内置 `article:*` 指令。

## Command 数据类与注册表

```python
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
BEIJING_TZ = timezone(timedelta(hours=8))
```

- `Command` 是单条指令的元数据 + 执行回调（lambda/闭包）。
- `COMMANDS` 是全局注册表，模块加载时被 `_register_defaults()` 填充。
- 指令名必须匹配 `^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$`，例如 `article:list-ids`、`article:set-date.subaction`。
- 选项名同样被限制成小写 ASCII，避免大小写/特殊字符导致的解析歧义。
- `MAX_COMMAND_LENGTH = 2000` 防止超长输入造成解析爆炸。
- `BEIJING_TZ` 是全模块共享的时区常量。

## 注册与 descriptor

```python
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
```

`register()` 用于第三方扩展（理论上未来可以在插件里 `register(Command(...))`）；`descriptor()` 把 `Command` 转成可序列化的字典，给 `/api/admin/commands` 返回的指令手册使用。`confirmationRequired` 默认在 `risk == "high"` 时为 `True`，但单条指令可以显式覆盖。

## 指令手册

```python
def get_guide() -> dict[str, Any]:
    return {
        "pattern": "<domain>:<action>[.<subaction>] [target] [--key=value] [--flag]",
        "rules": [...],
        "placeholderExamples": [...],
        "commands": [descriptor(command) for command in sorted(COMMANDS.values(), key=lambda item: item.name)],
    }
```

`get_guide()` 给前端管理台和 AI Agent（`plan_admin_commands`）使用，列出所有已注册指令、语法规则和示例。这是 AI Agent 规划自然语言指令时唯一能依赖的"指令清单"。

## Tokenizer

```python
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
```

状态机式 tokenizer，支持：

- 单引号 / 双引号包裹带空格的参数（`--title="带 空格 的 标题"`）。
- 反斜杠转义下一个字符（`--desc="引号\"OK"`）。
- 未闭合引号 → 返回 `errors`，整个指令被拒绝。
- 末尾单独的反斜杠 → 当作字面 `\` 保留。

这是手工实现的简单 shell 风格 tokenizer，不依赖 shlex 等标准库，因为我们需要更可控的错误处理。

## Parser

```python
def parse_admin_command(raw_input: Any) -> dict[str, Any]:
    raw = raw_input.strip() if isinstance(raw_input, str) else ""
    if not raw:
        return {"ok": False, "errors": ["指令不能为空。"], "tokens": []}
    if len(raw) > MAX_COMMAND_LENGTH:
        return {"ok": False, "errors": [f"指令不能超过 {MAX_COMMAND_LENGTH} 个字符。"], "tokens": []}
    tokens, errors = tokenize(raw)
    ...
    name = tokens[0] if tokens else ""
    parts = tokens[1:]
    if not COMMAND_NAME_PATTERN.match(name):
        errors.append("指令名格式无效...")
    positional: list[str] = []
    options: dict[str, Any] = {}
    ...
    return {"ok": True, "invocation": {"raw": raw, "name": name, "positional": positional, "options": options}, "tokens": tokens}
```

把 tokens 切成 (1) 第一个 token 作为指令名、(2) 剩余的位置参数、(3) `--key=value` / `--key value` / `--flag` 三种形式的选项。

`_add_option_value` 处理同名选项多次出现的情况——后出现的 value 会被追加进列表，让 `--ids=a --ids=b` 这样的批量参数成立。

## 调度执行

```python
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
```

返回 `status` 取值集合是固定的：

- `invalid`：解析失败。
- `unknown_command`：指令未注册（同时返回 `guide` 让调用方知道有哪些可用）。
- `dry_run`：调用方请求 `dryRun=true`，只回显 descriptor 不执行。
- `confirmation_required`：高风险指令但 `confirm != true`。
- `executed`：成功，`result` 是 handler 的返回值。
- `failed`：handler 抛异常。

`context` 是 `app.py` 注入的额外上下文（例如 `requestedAt` 当前时间），让指令能用"现在几点"解析 `--date=today`。

## 北京时间日期解析

```python
BEIJING_TZ = timezone(timedelta(hours=8))

def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=BEIJING_TZ)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def _parse_strict_command_date(value: str) -> str:
    text = value.strip()
    match = re.match(r"^(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$", text)
    if match:
        year, month, day, hour, minute = match.groups()
        return _to_utc_iso(datetime(int(year), int(month), int(day), int(hour or 0), int(minute or 0), tzinfo=BEIJING_TZ))
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        ...
```

所有日期默认按北京时间解析（`tzinfo=BEIJING_TZ`），再转换成 UTC ISO。所以 `2026.06.09 18:30` 落库成 `2026-06-09T10:30:00Z`。这是为了让管理员用本地时间直觉输入，避免时区错位。

`_parse_command_month` 支持 `2026-04` / `2026年4月` / `4月` 三种写法，单独说"4月"时用 context 里的"当前时间"年份推断。

## 内置 article:* 指令

`_register_defaults()` 注册 5 条内置指令：

| 指令名 | 风险 | 用途 |
| --- | --- | --- |
| `article:list-ids` | low | 列出全部文章（含草稿）的 ID/slug/title/status |
| `article:list` | low | 按 `--date`/`--month`/`--q`/`--status`/`--limit` 过滤文章 |
| `article:get-content` | low | 取一篇文章的正文、分类、摘要 |
| `article:set-title` | medium | 修改文章标题（长度上限 120） |
| `article:set-date` | medium | 改单篇文章发布日期（具体日 + 月份两种模式） |
| `article:set-date-bulk` | medium | 批量改多篇文章日期，月份模式保留各自日时 |

`article:set-date-bulk` 是 `ai_agent.py` 里 AI 规划"把这些文章挪到 4 月"时的关键依赖：

```python
def _apply_month_to_published_at(current_value, year, month) -> str:
    current = _parse_local_datetime(current_value) or datetime(year, month, 1, 0, 0, tzinfo=BEIJING_TZ)
    last_day = calendar.monthrange(year, month)[1]
    day = min(max(1, current.day), last_day)
    return _to_utc_iso(current.replace(year=year, month=month, day=day))
```

月份模式不会粗暴把所有文章设成 1 号，而是保留每篇文章原本的日和时分，只在跨月时夹到该月最后一天（2 月只有 28/29 天）。

## 文章目标解析

```python
def _resolve_unique_article_target(target: str, items: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
    articles = items or _list_all_admin_articles()
    direct = [item for item in articles if item["id"] == target or item["slug"] == target]
    if direct:
        return direct[0]
    titled = [item for item in articles if item["title"] == target]
    if len(titled) > 1:
        raise ValueError(f"标题匹配到多篇文章，请改用 ID 或 slug：{target}")
    return titled[0] if titled else None
```

`set-date` 这类指令允许传入 id、slug 或标题。如果标题在库里唯一，就用标题；如果匹配到多篇，**主动报错**让用户改用更精确的标识，避免歧义写错数据。

## 备注

- 所有指令 handler 是同步的 lambda/闭包，没有 await——指令系统刻意保持轻量同步，重逻辑（LLM、星图）走专用端点。
- `risk` 字段是约定，没有被代码强制执行任何业务限制，只是决定是否需要 `confirm=true`。如果想加更严格的角色分级，可以从这里扩展。
- 想新增指令：在 `_register_defaults()` 里加一段 `register(Command(...))`，同时更新 `ai_agent.py` 的 `_normalize_admin_command_plan_request` 里的示例，让 AI 知道何时使用它。
