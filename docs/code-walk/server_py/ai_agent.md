# ai_agent.py

> 源路径：`server_py/ai_agent.py`
> 总行数：约 796 行

封装所有 LLM 调用：统一的 `_chat_json_completion` 出口 + 一组业务生成函数（文章元数据、星图 Passage / Canonical Keyword / Relationship / Deep Path、管理员指令规划、连通性测试）。

## 文件概览

`ai_agent.py` 是后端唯一会发出外部 HTTP 请求到 LLM 服务（DeepSeek/OpenAI/Moonshot/Qwen/智谱/自定义）的模块。它解决两类问题：

1. **统一封装**：所有业务都用同一份 prompt 框架（"只返回严格 JSON"）、同一个 token 计费钩子、同一个错误降级路径。这避免了每个业务方各自实现一套 httpx 调用、各自处理 JSON 解析失败。
2. **数据契约稳定**：每个生成函数都把 LLM 的原始响应**严格 normalize** 成稳定的字典 schema，让上层（`content.py`/`starfield.py`/`app.py`）不用关心 LLM 偶尔返回的脏字段、字段缺失、超长内容。

文件分三大块：

- **业务入口**（公共 async 函数）：`generate_article_metadata` / `generate_starfield_passages` / `generate_starfield_canonical_keywords` / `generate_starfield_relationships` / `generate_starfield_deep_paths` / `plan_admin_commands` / `test_llm_connection`。
- **`_chat_json_completion`**：所有 HTTP 调用、token 记账、错误转换的唯一出口。
- **Request/Response 规范化函数**：每个业务都有 `_normalize_xxx_request` 和 `_normalize_xxx_response` 一对函数，处理输入输出。

## AiAgentError

```python
class AiAgentError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
```

所有错误都包装成 `AiAgentError`，带 HTTP 风格的 `status_code`：400（输入问题）、503（LLM 不可用）、502（LLM 响应无效）、500（其他）。`app.py` 路由层捕获 `AiAgentError` 后直接返回对应 HTTP 状态码，让"LLM 不可用"在网络层语义上和"普通 HTTP 错误"一致。

## 业务入口一览

```python
async def generate_article_metadata(input_data) -> dict[str, str]: ...
async def generate_starfield_passages(input_data) -> dict[str, Any]: ...
async def generate_starfield_canonical_keywords(input_data) -> dict[str, Any]: ...
async def generate_starfield_relationships(input_data) -> dict[str, Any]: ...
async def generate_starfield_deep_paths(input_data) -> dict[str, Any]: ...
async def test_llm_connection() -> dict[str, Any]: ...
async def plan_admin_commands(input_data) -> dict[str, Any]: ...
```

每个入口的模式一致：

1. 调 `_normalize_xxx_request` 准备 user payload（带 task/constraints/rules/examples）。
2. 调 `_chat_json_completion(feature, system_prompt, user_payload)`。
3. 调 `_normalize_xxx_response` 把 LLM JSON 规范化。

业务语义分别是：

- **article_metadata**：根据正文生成 `title`/`excerpt`/`seoTitle`/`seoDescription`。
- **starfield_passages**：把一篇文章拆 3-12 个 Passage（必须原文连续片段，禁止改写）。
- **starfield_canonical_keywords**：合并相似关键词成 canonical keyword（不是节点，仅作关系证据）。
- **starfield_relationships**：在候选边中升级 `relationshipType`（不能创造新边）。
- **starfield_deep_paths**：四个 Agent 协作生成"A → 中介 → B"的认知探索路径。
- **plan_admin_commands**：把自然语言请求转成已注册指令序列。
- **test_llm_connection**：连通性测试（最小 JSON 对话）。

## 系统提示词的统一格式

```python
"你是中文博客编辑助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 字段必须为 title、excerpt、seoTitle、seoDescription。"
```

所有 system prompt 都强制"只返回严格 JSON、不要 Markdown、不要解释"。这是 OpenAI `response_format={"type": "json_object"}` 之外的第二道防线——即使模型偶尔忽略 response_format，prompt 也会重申约束。

每个 prompt 都在系统消息里**显式声明顶层字段名**，让模型在 JSON object 模式下不会自由发挥字段名。

## `_chat_json_completion` 统一出口

```python
async def _chat_json_completion(feature: str, system_prompt: str, user_payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_llm_settings()
    if not settings["enabled"]:
        raise AiAgentError(503, "LLM ability is disabled")
    if settings["provider"] not in COMPATIBLE_PROVIDERS:
        raise AiAgentError(400, "当前 AI-AGENT 暂不支持该服务商。")
    if not settings["apiKey"].strip():
        raise AiAgentError(400, f"{feature} LLM API Key is not configured")
    ...
    usage_recorded = False
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                _resolve_chat_completions_url(settings["baseUrl"]),
                headers={...},
                json={
                    "model": settings["model"],
                    "temperature": settings["temperature"],
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                },
            )
        ...
```

关键设计：

- **前置检查**：未启用 / 不支持的 provider / 没有 API key / 没有 base_url / 没有 model，全部前置抛 `AiAgentError`，**不发任何网络请求**。这让 `smoke_test.py` 的"LLM 关闭后调用必须返回 503 且不联网"断言成立。
- **统一 base URL 拼接**：`_resolve_chat_completions_url` 允许 base_url 写到 `/chat/completions` 或只写到根，自动补全。
- **`response_format={"type": "json_object"}`**：要求 LLM 强制返回 JSON，配合 system prompt 双保险。
- **`ensure_ascii=False`**：中文 payload 不转义，让 LLM 看到的是真实中文，而不是 `\uXXXX`。
- **60 秒超时**：足够 LLM 完成长输出（如 starfield_deep_paths）。

## Token 计费

```python
def _record_llm_usage(feature, settings, status, usage=None, error_message="") -> None:
    record_llm_token_usage({
        "feature": feature,
        "provider": settings["provider"],
        "model": settings["model"],
        "promptTokens": (usage or {}).get("promptTokens"),
        "completionTokens": (usage or {}).get("completionTokens"),
        "totalTokens": (usage or {}).get("totalTokens"),
        "status": status,
        "errorMessage": error_message,
    })
```

每次调用都会在 `llm_token_usage` 表里记一条流水：feature 名（用来区分哪类调用）、token 用量、状态、错误信息。`/api/admin/llm-token-usage` 暴露汇总，让管理员看到"上个月 article_metadata 调了多少次、花了多少 token"。

`usage_recorded` 标志位避免重复记账：HTTP 错误已经记了一条 failed，后面再抛异常时不会再记第二条。

## JSON 解析的容错

```python
def _parse_json_object(content: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            ...
```

即使 system prompt 强制 JSON、`response_format` 强制 JSON，模型偶尔还是会带 Markdown 围栏（```json ... ```）或在 JSON 前后插一段解释。`_parse_json_object` 做三道处理：

1. 去掉 Markdown 围栏。
2. 尝试直接 `json.loads`。
3. 失败则提取第一个 `{` 到最后一个 `}` 之间的子串再试。

仍然失败抛 `AiAgentError(502, "LLM response was not valid JSON")`，对应 `/api/admin/ai-agent/...` 路由返回 502。

## Request 规范化：以 starfield_relationships 为例

```python
def _normalize_starfield_relationship_request(input_data) -> dict[str, Any]:
    passages = input_data.get("passages")
    candidates = input_data.get("candidates")
    mode = "deep" if input_data.get("mode") == "deep" else "concrete"
    ...
    normalized_candidates = []
    seen_pairs: set[tuple[str, str]] = set()
    for candidate in candidates[:500]:
        ...
        source_id = _normalize_text(candidate.get("sourcePassageId") or candidate.get("sourceId"), 80)
        target_id = _normalize_text(candidate.get("targetPassageId") or candidate.get("targetId"), 80)
        if not source_id or not target_id or source_id == target_id or source_id not in valid_passage_ids or target_id not in valid_passage_ids:
            continue
        pair = (min(source_id, target_id), max(source_id, target_id))
        if pair in seen_pairs:
            continue
        ...
```

每个 `_normalize_xxx_request` 都做这几件事：

- 把 LLM 不需要看到的字段过滤掉（只留 id/title/keywords/excerpt）。
- **截断长度**（passages ≤ 180、candidates ≤ 500、keywords ≤ 10 等），避免 prompt 超长。
- **去重**（candidate pair 用 set 去重）。
- **跨表校验**（candidate 引用的 passage_id 必须在 valid_passage_ids 集合里，否则丢弃，避免 LLM 编造不存在的边）。
- **明确 mode 分支**（concrete vs deep 关系类型集合不同）。

这些都是"防御性 prompt 工程"——把一切可能让 LLM 自由发挥的入口都堵住。

## Rules / Examples / Constraints

```python
"rules": [
    "只能输出 candidates 中已有的 sourcePassageId 和 targetPassageId 组合。",
    "如果只是共享标签或主题相似，relationshipType 必须保持 same_topic。",
    "只有 Passage Text 清楚支持时，才升级为 prerequisite、further_reading、problem_solution 或 comparison。",
    ...
],
```

每个 request 里都内嵌一组明确的 rules，配合具体 examples（包括正确示例和错误示例），把 LLM 的输出空间严格限定在业务可接受范围内。这是"提示词工程"的核心——不是依赖模型自己理解业务，而是用规则+示例把业务约束写死。

## Response 规范化：以 starfield_deep_path_response 为例

```python
def _normalize_starfield_deep_path_response(value) -> dict[str, Any]:
    paths = value.get("paths")
    ...
    for path in paths[:120]:
        source_id = _normalize_text(path.get("sourcePassageId") or path.get("sourceId"), 80)
        passage_ids = [_normalize_text(item, 80) for item in (path.get("passageIds") if isinstance(path.get("passageIds"), list) else [])]
        passage_ids = [item for item in passage_ids if item]
        if source_id and (not passage_ids or passage_ids[0] != source_id):
            passage_ids = [source_id, *[item for item in passage_ids if item != source_id]]
        passage_ids = list(dict.fromkeys(passage_ids))[:4]
        ...
        if len(passage_ids) < 2 or not source_id or not question or not rationale or not critique:
            continue
        ...
```

Response 规范化做了几层保护：

- **截断**（最多 120 条 path）。
- **补全**（如果 path 没把 source_id 放在 passage_ids[0]，主动补上）。
- **去重**（同序列的 path 只保留一条）。
- **强制字段**（passage 数量 < 2 / 缺 question / 缺 rationale / 缺 critique 直接丢弃）。
- **类型映射**（`pathType` 不在允许集合里就降级到 `inquiry_path`）。

这层规范化是上层 `starfield.py` 不需要再校验一遍 LLM 输出的关键。

## admin_command_planner 的特殊处理

```python
def _normalize_admin_command_plan_request(input_data, user_message) -> dict[str, Any]:
    guide = input_data.get("guide") if isinstance(input_data.get("guide"), dict) else {}
    commands = guide.get("commands") if isinstance(guide.get("commands"), list) else []
    history = input_data.get("history") if isinstance(input_data.get("history"), list) else []
    recent_results = input_data.get("recentResults") if isinstance(input_data.get("recentResults"), list) else []
    ...
```

`plan_admin_commands` 是把自然语言转成指令序列的入口。它的 prompt 注入了：

- **availableCommands**：从 `get_guide()` 拿到的所有已注册指令清单。
- **conversationHistory**：最近 8 条对话。
- **recentCommandResults**：最近 4 条指令结果（用于解析"这些文章"这种指代）。
- **rules**：硬约束（只能用 availableCommands 里的指令、必须从 recentCommandResults 提取 id 不能臆造等）。
- **examples**：典型 user → commands 映射。

`_trim_admin_command_result` 把每条历史指令结果裁剪成 80 条以内的 brief，避免 prompt 过长。

## 兼容的 provider 集合

```python
COMPATIBLE_PROVIDERS = {"deepseek", "openai", "moonshot", "qwen", "zhipu", "custom"}
```

所有这些 provider 都遵循 OpenAI Chat Completions API 格式，所以同一份请求体能直接打到 deepseek/qwen/zhipu/moonshot 的兼容端点。`custom` 是给自建网关或本地 vllm 留的逃生口。

## 通用辅助函数

```python
def _normalize_text(value: Any, max_length: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_length]

def _safe_strength(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, round(number, 2)))

def _safe_int(value: Any, fallback: int) -> int:
    ...
```

- `_normalize_text`：所有字符串字段都过一遍它，做"空白折叠 + 截断"，避免 LLM 返回带换行的标题污染数据库。
- `_safe_strength`：所有 strength 字段强制 clamp 到 [0, 1]，避免模型输出 1.5 / -3 之类的非法值。
- `_safe_int`：maxPaths 等数值字段的 fallback。

## 备注

- 文件以"防御性编程"为核心哲学：宁可丢字段、降级 type，也不让脏数据进入业务表。
- 所有 LLM 调用都经过 `_record_llm_usage`，所以 `/api/admin/llm-token-usage` 是审计 LLM 成本/调用频率的唯一入口。
- 想新增一类 LLM 业务：参照现有模式新增 `generate_xxx` + `_normalize_xxx_request` + `_normalize_xxx_response` 三件套，不要直接在 `starfield.py` 里手搓 httpx。
- LLM 测试需要在 `compat_test.py` 的"LLM 未配置时返回 503"和"测试夹具注入 mock 响应"两条路径中至少选一条覆盖。
