from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .content import get_llm_settings, record_llm_token_usage


COMPATIBLE_PROVIDERS = {"deepseek", "openai", "moonshot", "qwen", "zhipu", "custom"}
MAX_BODY_CHARACTERS = 12000
CONCRETE_STARFIELD_RELATIONSHIP_TYPES = {"same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"}
ABSTRACT_STARFIELD_RELATIONSHIP_TYPES = {
    "shared_principle",
    "same_problem_shape",
    "method_transfer",
    "tradeoff_parallel",
    "case_generalization",
    "implementation_echo",
}
STARFIELD_RELATIONSHIP_TYPES = CONCRETE_STARFIELD_RELATIONSHIP_TYPES | ABSTRACT_STARFIELD_RELATIONSHIP_TYPES


class AiAgentError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


async def generate_article_metadata(input_data: dict[str, Any]) -> dict[str, str]:
    body_markdown = _normalize_text(input_data.get("bodyMarkdown"), MAX_BODY_CHARACTERS)
    if len(re.sub(r"\s", "", body_markdown)) < 20:
        raise AiAgentError(400, "正文内容太少，无法生成标题和摘要。")

    payload = await _chat_json_completion(
        "article_metadata",
        "你是中文博客编辑助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 字段必须为 title、excerpt、seoTitle、seoDescription。",
        {
            "task": "根据文章内容生成标题、摘要、SEO 标题、SEO 描述。",
            "constraints": {
                "title": "不超过 80 个字符，准确、自然、有信息量",
                "excerpt": "不超过 180 个字符，用一到两句话概括文章价值",
                "seoTitle": "不超过 80 个字符，可与标题相同但更适合搜索",
                "seoDescription": "不超过 180 个字符，适合搜索结果展示",
            },
            "current": {
                "title": _normalize_text(input_data.get("title"), 120),
                "excerpt": _normalize_text(input_data.get("excerpt"), 300),
                "category": _normalize_text(input_data.get("category"), 80),
                "tags": [_normalize_text(tag, 40) for tag in input_data.get("tags", []) if _normalize_text(tag, 40)][:12],
            },
            "bodyMarkdown": body_markdown,
        },
    )
    return _normalize_suggestion(payload)


async def generate_starfield_passages(input_data: dict[str, Any]) -> dict[str, Any]:
    payload = await _chat_json_completion(
        "starfield_passages",
        "你是中文博客的文段拆分助手。只返回严格 JSON，不要 Markdown，不要解释。必须从原文中原样摘取文段，不得改写、补写、总结。JSON 顶层字段必须是 articles。",
        _normalize_starfield_passage_request(input_data),
    )
    return _normalize_starfield_passage_response(payload)


async def generate_starfield_canonical_keywords(input_data: dict[str, Any]) -> dict[str, Any]:
    payload = await _chat_json_completion(
        "starfield_canonical_keywords",
        "你是中文博客的标签归并助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 顶层字段必须是 canonicalKeywords。标签不是节点，只是生成 Passage Relationship 的证据。",
        _normalize_starfield_canonical_keyword_request(input_data),
    )
    return _normalize_starfield_canonical_keyword_response(payload)


async def generate_starfield_relationships(input_data: dict[str, Any]) -> dict[str, Any]:
    payload = await _chat_json_completion(
        "starfield_relationships",
        "你是中文博客的知识关系助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 顶层字段必须是 relationships。只能在给定候选边中升级关系类型，不能创造新的 Passage pair。",
        _normalize_starfield_relationship_request(input_data),
    )
    return _normalize_starfield_relationship_response(payload)


async def generate_starfield_deep_paths(input_data: dict[str, Any]) -> dict[str, Any]:
    payload = await _chat_json_completion(
        "starfield_deep_paths",
        "你是由四个认知探索 Agent 协作的中文博客深层关系挖掘系统。只返回严格 JSON，不要 Markdown，不要解释。JSON 顶层字段必须是 paths。",
        _normalize_starfield_deep_path_request(input_data),
    )
    return _normalize_starfield_deep_path_response(payload)


async def test_llm_connection() -> dict[str, Any]:
    payload = await _chat_json_completion(
        "llm_connection_test",
        "你是连接测试助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 字段必须为 ok、message。",
        {
            "task": "测试当前 LLM 配置是否可以完成一次最小 JSON 对话。",
            "expected": {"ok": True, "message": "pong"},
        },
    )
    return {
        "ok": bool(payload.get("ok")),
        "message": _normalize_text(payload.get("message"), 120) or "LLM 已返回有效 JSON。",
    }


async def plan_admin_commands(input_data: dict[str, Any]) -> dict[str, Any]:
    user_message = _normalize_text(input_data.get("message"), 1000)
    if not user_message:
        raise AiAgentError(400, "缺少自然语言指令。")
    payload = await _chat_json_completion(
        "admin_command_planner",
        "你是中文博客后台的管理员指令规划助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 顶层字段必须为 reply、commands。",
        _normalize_admin_command_plan_request(input_data, user_message),
    )
    return _normalize_admin_command_plan_response(payload)


async def _chat_json_completion(feature: str, system_prompt: str, user_payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_llm_settings()
    if not settings["enabled"]:
        raise AiAgentError(503, "LLM ability is disabled")
    if settings["provider"] not in COMPATIBLE_PROVIDERS:
        raise AiAgentError(400, "当前 AI-AGENT 暂不支持该服务商。")
    if not settings["apiKey"].strip():
        raise AiAgentError(400, f"{feature} LLM API Key is not configured")
    if not settings["baseUrl"].strip():
        raise AiAgentError(400, f"{feature} LLM Base URL is not configured")
    if not settings["model"].strip():
        raise AiAgentError(400, f"{feature} LLM model is not configured")

    usage_recorded = False
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                _resolve_chat_completions_url(settings["baseUrl"]),
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {settings['apiKey']}",
                    "Content-Type": "application/json; charset=utf-8",
                },
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
        if response.status_code >= 400:
            _record_llm_usage(feature, settings, "failed", None, f"LLM request failed: {response.status_code}")
            usage_recorded = True
            raise AiAgentError(503 if response.status_code >= 500 else 400, f"LLM request failed: {response.status_code}")
        payload = response.json()
        content = _read_chat_message_content(payload)
        if not content:
            raise AiAgentError(502, "LLM response did not include message content")
        parsed = _parse_json_object(content)
        _record_llm_usage(feature, settings, "success", _read_token_usage(payload))
        usage_recorded = True
        return parsed
    except Exception as error:
        if not usage_recorded:
            _record_llm_usage(feature, settings, "failed", None, str(error) or "Unknown LLM error")
        if isinstance(error, AiAgentError):
            raise
        raise AiAgentError(503, str(error) or "Unknown LLM error") from error


def _resolve_chat_completions_url(base_url: str) -> str:
    trimmed = base_url.strip().rstrip("/")
    if re.search(r"/chat/completions$", trimmed, re.I):
        return trimmed
    return f"{trimmed}/chat/completions"


def _read_chat_message_content(value: dict[str, Any]) -> str:
    choices = value.get("choices") if isinstance(value, dict) else []
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    return message.get("content") if isinstance(message, dict) and isinstance(message.get("content"), str) else ""


def _read_token_usage(value: dict[str, Any]) -> dict[str, int | None] | None:
    usage = value.get("usage") if isinstance(value, dict) else None
    if not isinstance(usage, dict):
        return None
    return {
        "promptTokens": _read_token_count(usage.get("prompt_tokens")),
        "completionTokens": _read_token_count(usage.get("completion_tokens")),
        "totalTokens": _read_token_count(usage.get("total_tokens")),
    }


def _read_token_count(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _record_llm_usage(feature: str, settings: dict[str, Any], status: str, usage: dict[str, int | None] | None = None, error_message: str = "") -> None:
    record_llm_token_usage(
        {
            "feature": feature,
            "provider": settings["provider"],
            "model": settings["model"],
            "promptTokens": (usage or {}).get("promptTokens"),
            "completionTokens": (usage or {}).get("completionTokens"),
            "totalTokens": (usage or {}).get("totalTokens"),
            "status": status,
            "errorMessage": error_message,
        }
    )


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
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    raise AiAgentError(502, "LLM response was not valid JSON")


def _parse_suggestion_json(content: str) -> dict[str, Any]:
    return _parse_json_object(content)


def _normalize_suggestion(value: dict[str, Any]) -> dict[str, str]:
    title = _normalize_text(value.get("title"), 80)
    excerpt = _normalize_text(value.get("excerpt"), 180)
    seo_title = _normalize_text(value.get("seoTitle"), 80) or title
    seo_description = _normalize_text(value.get("seoDescription"), 180) or excerpt
    if not title or not excerpt:
        raise AiAgentError(502, "LLM response missed required metadata fields")
    return {"title": title, "excerpt": excerpt, "seoTitle": seo_title, "seoDescription": seo_description}


def _normalize_admin_command_plan_request(input_data: dict[str, Any], user_message: str) -> dict[str, Any]:
    guide = input_data.get("guide") if isinstance(input_data.get("guide"), dict) else {}
    commands = guide.get("commands") if isinstance(guide.get("commands"), list) else []
    history = input_data.get("history") if isinstance(input_data.get("history"), list) else []
    recent_results = input_data.get("recentResults") if isinstance(input_data.get("recentResults"), list) else []
    return {
        "task": "把管理员的自然语言请求转换为已注册后台指令。你只做指令规划，不直接修改数据。",
        "currentTime": _normalize_text(input_data.get("requestedAt"), 80),
        "userMessage": user_message,
        "conversationHistory": [_normalize_admin_history_item(item) for item in history[-8:] if isinstance(item, dict)],
        "recentCommandResults": [_trim_admin_command_result(item) for item in recent_results[-4:]],
        "availableCommands": [
            {
                "name": _normalize_text(command.get("name"), 80),
                "summary": _normalize_text(command.get("summary"), 180),
                "risk": _normalize_text(command.get("risk"), 20),
                "arguments": command.get("arguments") if isinstance(command.get("arguments"), list) else [],
            }
            for command in commands
            if isinstance(command, dict)
        ],
        "rules": [
            "只能使用 availableCommands 中列出的指令名。",
            "列举今天的文章时使用：article:list --date=today。",
            "按月份列举文章时使用：article:list --month=\"YYYY-MM\"；用户只说几月时，用 currentTime 所在年份。",
            "用户说这些文章、刚才获取到的文章、上面这些时，必须从 recentCommandResults 的 result.items 里提取 id，不要臆造文章 ID。",
            "批量把刚才文章放到某个月且没有具体日期时，使用 article:set-date-bulk --ids=id1,id2 --month=\"YYYY-MM\"，不要生成具体日。",
            "单篇指定到具体日期时使用 article:set-date <id-or-slug> --date=\"YYYY.MM.DD HH:mm\"；未带时区默认北京时间。",
            "用户只提供标题或关键词但没有明确 ID/slug 时，先用 article:list --q=\"关键词\" 定位，不要直接写入。",
            "如果信息不足，commands 返回空数组，并在 reply 里说明还缺什么。",
            "不要输出自然语言以外的命令格式，也不要输出未注册命令。",
        ],
        "examples": [
            {
                "user": "列举出来今天的文章",
                "commands": [{"input": "article:list --date=today", "purpose": "列出今天发布的文章"}],
            },
            {
                "user": "给我修改一下这些文章日期，放到2026年4月份",
                "commands": [{"input": "article:set-date-bulk --ids=article_a,article_b --month=\"2026-04\"", "purpose": "把上一轮列出的文章移动到 2026 年 4 月，保留各自日和时间"}],
            },
        ],
    }


def _normalize_admin_history_item(item: dict[str, Any]) -> dict[str, str]:
    return {
        "role": _normalize_text(item.get("role"), 20),
        "content": _normalize_text(item.get("content"), 500),
    }


def _trim_admin_command_result(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    result = value.get("result")
    if isinstance(result, dict) and isinstance(result.get("items"), list):
        return {
            "command": _normalize_text(value.get("input") or value.get("command"), 300),
            "result": {
                "count": result.get("count"),
                "items": [
                    {
                        "id": _normalize_text(item.get("id"), 100),
                        "slug": _normalize_text(item.get("slug"), 140),
                        "title": _normalize_text(item.get("title"), 160),
                        "date": _normalize_text(item.get("date"), 40),
                        "publishedAt": _normalize_text(item.get("publishedAt"), 80),
                    }
                    for item in result.get("items")[:80]
                    if isinstance(item, dict)
                ],
            },
        }
    return {
        "command": _normalize_text(value.get("input") or value.get("command"), 300),
        "status": _normalize_text(value.get("status"), 40),
        "result": result,
    }


def _normalize_admin_command_plan_response(value: dict[str, Any]) -> dict[str, Any]:
    commands = value.get("commands") if isinstance(value.get("commands"), list) else []
    normalized_commands = []
    for command in commands[:5]:
        if not isinstance(command, dict):
            continue
        raw_input = _normalize_text(command.get("input") or command.get("command"), 1000)
        if not raw_input:
            continue
        normalized_commands.append(
            {
                "input": raw_input,
                "purpose": _normalize_text(command.get("purpose"), 300),
                "dryRun": bool(command.get("dryRun")) if isinstance(command.get("dryRun"), bool) else False,
                "confirm": bool(command.get("confirm")) if isinstance(command.get("confirm"), bool) else False,
            }
        )
    reply = _normalize_text(value.get("reply"), 500) or ("已生成指令。" if normalized_commands else "没有足够信息生成指令。")
    return {"reply": reply, "commands": normalized_commands}


def _normalize_starfield_passage_request(input_data: dict[str, Any]) -> dict[str, Any]:
    article = input_data.get("article") if isinstance(input_data, dict) else None
    if not isinstance(article, dict):
        raise AiAgentError(400, "Starfield passage generation requires one article payload")
    body_markdown = _normalize_text(article.get("bodyMarkdown"), MAX_BODY_CHARACTERS)
    if len(re.sub(r"\s", "", body_markdown)) < 80:
        raise AiAgentError(400, "正文内容太少，无法拆分 Passage。")
    return {
        "task": "为单篇文章拆分 3 到 12 个 Passage。",
        "constraints": {
            "minPassagesPerArticle": 3,
            "maxPassagesPerArticle": 12,
            "rules": [
                "每个 passage 必须来自原文的连续片段，不能改写。",
                "title 简洁，最好能对应小节或句群含义。",
                "text 必须是原文中的连续内容，尽量保留原文标点。",
                "excerpt 可以更短，用来展示预览。",
                "keywords 只提炼 3 到 8 个关键词。",
            ],
        },
        "article": {
            "id": _normalize_text(article.get("id"), 80),
            "title": _normalize_text(article.get("title"), 120),
            "category": _normalize_text(article.get("category"), 80),
            "tags": [_normalize_text(tag, 40) for tag in article.get("tags", []) if _normalize_text(tag, 40)][:12],
            "bodyMarkdown": body_markdown,
        },
    }


def _normalize_starfield_relationship_request(input_data: dict[str, Any]) -> dict[str, Any]:
    passages = input_data.get("passages") if isinstance(input_data, dict) else None
    candidates = input_data.get("candidates") if isinstance(input_data, dict) else None
    mode = "deep" if input_data.get("mode") == "deep" else "concrete"
    if not isinstance(passages, list) or not passages:
        raise AiAgentError(400, "Starfield relationship generation requires passages payload")
    if not isinstance(candidates, list) or not candidates:
        raise AiAgentError(400, "Starfield relationship generation requires keyword-derived candidates")
    normalized_passages = []
    valid_passage_ids: set[str] = set()
    for passage in passages[:180]:
        if not isinstance(passage, dict):
            continue
        passage_id = _normalize_text(passage.get("id"), 80)
        article_id = _normalize_text(passage.get("articleId"), 80)
        if not passage_id or not article_id:
            continue
        valid_passage_ids.add(passage_id)
        normalized_passages.append(
            {
                "id": passage_id,
                "articleId": article_id,
                "title": _normalize_text(passage.get("title"), 120),
                "excerpt": _normalize_text(passage.get("excerpt") or passage.get("text"), 260),
                "keywords": [_normalize_text(item, 40) for item in (passage.get("keywords") if isinstance(passage.get("keywords"), list) else []) if _normalize_text(item, 40)][:10],
                "articleTitle": _normalize_text((passage.get("article") or {}).get("title") if isinstance(passage.get("article"), dict) else passage.get("articleTitle"), 120),
                "articleCategory": _normalize_text((passage.get("article") or {}).get("category") if isinstance(passage.get("article"), dict) else passage.get("articleCategory"), 80),
            }
        )
    if not normalized_passages:
        raise AiAgentError(400, "Starfield relationship generation requires valid passage payload")
    normalized_candidates = []
    seen_pairs: set[tuple[str, str]] = set()
    for candidate in candidates[:500]:
        if not isinstance(candidate, dict):
            continue
        source_id = _normalize_text(candidate.get("sourcePassageId") or candidate.get("sourceId"), 80)
        target_id = _normalize_text(candidate.get("targetPassageId") or candidate.get("targetId"), 80)
        if not source_id or not target_id or source_id == target_id or source_id not in valid_passage_ids or target_id not in valid_passage_ids:
            continue
        pair = (min(source_id, target_id), max(source_id, target_id))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        normalized_candidates.append(
            {
                "sourcePassageId": source_id,
                "targetPassageId": target_id,
                "evidenceKeywords": _clean_starfield_keywords(candidate.get("evidenceKeywords")),
                "defaultRelationshipType": "same_topic",
                "defaultRationale": _normalize_text(candidate.get("rationale"), 300),
                "defaultStrength": _safe_strength(candidate.get("strength")),
            }
        )
    if not normalized_candidates:
        raise AiAgentError(400, "Starfield relationship generation requires valid keyword-derived candidates")
    relationship_types = (
        ["shared_principle", "same_problem_shape", "method_transfer", "tradeoff_parallel", "case_generalization", "implementation_echo"]
        if mode == "deep"
        else ["same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"]
    )
    rules = (
        [
            "只能输出 candidates 中已有的 sourcePassageId 和 targetPassageId 组合。",
            "深度关系必须说明两个文段背后的共同原则、同构问题、方法迁移、相似取舍、案例与一般化或实现呼应。",
            "不要只因为共享主题就输出抽象关系；必须能分别落回两个 Passage 的内容证据。",
            "rationale 必须先说明抽象关系，再说明两个文段如何分别体现它，并尽量引用 evidenceKeywords。",
            "strength 取 0 到 1 之间的小数。",
            "evidenceKeywords 必须来自候选边给出的 evidenceKeywords。",
        ]
        if mode == "deep"
        else [
            "只能输出 candidates 中已有的 sourcePassageId 和 targetPassageId 组合。",
            "如果只是共享标签或主题相似，relationshipType 必须保持 same_topic。",
            "只有 Passage Text 清楚支持时，才升级为 prerequisite、further_reading、problem_solution 或 comparison。",
            "rationale 必须说明关系，并尽量引用 evidenceKeywords。",
            "strength 取 0 到 1 之间的小数。",
            "evidenceKeywords 必须来自候选边给出的 evidenceKeywords。",
        ]
    )
    return {
        "task": "只评估给定的抽象候选边，挖掘两个 Passage 背后的深层结构性关系。" if mode == "deep" else "只评估给定的 Keyword-Derived Relationship 候选边。共享标签只能证明 same_topic；如果 Passage Text 支持更具体的语义关系，可以升级 relationshipType。",
        "constraints": {
            "relationshipTypes": relationship_types,
            "maxCrossArticlePerPassage": 9,
            "rules": rules,
        },
        "passages": normalized_passages,
        "candidates": normalized_candidates,
        "allowedRelationshipTypes": relationship_types,
    }


def _normalize_starfield_passage_response(value: dict[str, Any]) -> dict[str, Any]:
    article_groups = value.get("articles") if isinstance(value, dict) else None
    if not isinstance(article_groups, list):
        article_groups = []
    passages_payload = value.get("passages") if isinstance(value, dict) else None
    if isinstance(passages_payload, list) and passages_payload:
        article_groups = [{"articleId": "", "passages": passages_payload}]
    articles = []
    for article in article_groups:
        if not isinstance(article, dict):
            continue
        article_id = _normalize_text(article.get("articleId") or article.get("id"), 80)
        passages = article.get("passages")
        if not article_id or not isinstance(passages, list):
            continue
        normalized_passages = []
        for passage in passages[:12]:
            if not isinstance(passage, dict):
                continue
            title = _normalize_text(passage.get("title"), 120)
            text = _normalize_text(passage.get("text"), MAX_BODY_CHARACTERS)
            excerpt = _normalize_text(passage.get("excerpt"), 180)
            keywords = _clean_starfield_keywords(passage.get("keywords"))
            anchor_hint = _normalize_text(passage.get("anchorHint"), 80)
            if not text or len(re.sub(r"\s", "", text)) < 20:
                continue
            if not title:
                title = excerpt[:80] or "未命名 Passage"
            normalized_passages.append(
                {
                    "title": title[:80],
                    "text": text[:1800],
                    "excerpt": excerpt[:180] or _normalize_text(text[:180], 180),
                    "keywords": keywords,
                    "anchorHint": anchor_hint[:80],
                }
            )
        if normalized_passages:
            articles.append({"articleId": article_id, "passages": normalized_passages[:12]})
    if not articles:
        raise AiAgentError(502, "LLM response missed valid passage groups")
    return {"articles": articles}


def _normalize_starfield_relationship_response(value: dict[str, Any]) -> dict[str, Any]:
    relationships = value.get("relationships") if isinstance(value, dict) else None
    if not isinstance(relationships, list):
        raise AiAgentError(502, "LLM response missed relationships array")
    normalized = []
    seen: set[tuple[str, str, str]] = set()
    for relationship in relationships[:500]:
        if not isinstance(relationship, dict):
            continue
        source_id = _normalize_text(relationship.get("sourcePassageId") or relationship.get("sourceId"), 80)
        target_id = _normalize_text(relationship.get("targetPassageId") or relationship.get("targetId"), 80)
        relationship_type = _normalize_text(relationship.get("relationshipType"), 40)
        rationale = _normalize_text(relationship.get("rationale"), 500)
        evidence_keywords = _clean_starfield_keywords(relationship.get("evidenceKeywords"))
        strength = _safe_strength(relationship.get("strength"))
        if not source_id or not target_id or source_id == target_id or relationship_type not in STARFIELD_RELATIONSHIP_TYPES:
            continue
        pair = (min(source_id, target_id), max(source_id, target_id), relationship_type)
        if pair in seen or not rationale:
            continue
        seen.add(pair)
        normalized.append(
            {
                "sourcePassageId": source_id,
                "targetPassageId": target_id,
                "relationshipType": relationship_type,
                "rationale": rationale[:500],
                "evidenceKeywords": evidence_keywords,
                "strength": strength,
            }
        )
    if not normalized:
        raise AiAgentError(502, "LLM response missed valid relationships")
    return {"relationships": normalized}


def _normalize_starfield_deep_path_request(input_data: dict[str, Any]) -> dict[str, Any]:
    source_passages = input_data.get("sourcePassages") if isinstance(input_data, dict) else None
    corpus_passages = input_data.get("corpusPassages") if isinstance(input_data, dict) else None
    existing_relationships = input_data.get("existingRelationships") if isinstance(input_data, dict) else []
    if not isinstance(source_passages, list) or not source_passages:
        raise AiAgentError(400, "Deep path mining requires source passages")
    if not isinstance(corpus_passages, list) or not corpus_passages:
        raise AiAgentError(400, "Deep path mining requires corpus passages")

    max_paths = max(1, min(80, _safe_int(input_data.get("maxPaths"), 24)))
    normalized_sources = [_normalize_deep_path_passage(item) for item in source_passages[:12] if isinstance(item, dict)]
    normalized_corpus = [_normalize_deep_path_passage(item) for item in corpus_passages[:260] if isinstance(item, dict)]
    normalized_sources = [item for item in normalized_sources if item["id"]]
    normalized_corpus = [item for item in normalized_corpus if item["id"]]
    if not normalized_sources or not normalized_corpus:
        raise AiAgentError(400, "Deep path mining requires valid passage payload")

    valid_ids = {item["id"] for item in normalized_corpus}
    normalized_relationships = []
    if isinstance(existing_relationships, list):
        for relationship in existing_relationships[:500]:
            if not isinstance(relationship, dict):
                continue
            source_id = _normalize_text(relationship.get("sourcePassageId") or relationship.get("sourceId"), 80)
            target_id = _normalize_text(relationship.get("targetPassageId") or relationship.get("targetId"), 80)
            if source_id in valid_ids and target_id in valid_ids and source_id != target_id:
                normalized_relationships.append(
                    {
                        "sourcePassageId": source_id,
                        "targetPassageId": target_id,
                        "relationshipType": _normalize_text(relationship.get("relationshipType"), 40),
                        "rationale": _normalize_text(relationship.get("rationale"), 260),
                    }
                )

    return {
        "task": "使用四个 LLM 认知探索 Agent 生成 Deep Relationship Paths。不要做关键词匹配，不要只输出两两同主题关系。",
        "agentRoles": {
            "inquirerAgent": "从每个 source Passage 生成求知者读到这里后自然出现的疑问、启发、缺口或下一步探索意图。",
            "retrieverAgent": "把每个 Inquiry 转成多个搜索视角，并从 corpusPassages 中选择能回答、补足、挑战、迁移或承接这个 Inquiry 的 Passage。",
            "pathBuilderAgent": "把 source Passage、候选 Passage 和必要的中介 Passage 组织成有方向的路径，允许 A -> B -> C。",
            "criticAgent": "质疑路径是否牵强、是否只是同主题、是否每一步都有源文段证据；不通过的路径不要输出。",
        },
        "constraints": {
            "rules": [
                "paths 中每条路径必须从一个 sourcePassageId 开始。",
                "passageIds 必须按阅读/求知顺序排列，长度为 2 到 4。",
                "路径可以是单向的；不要假设端点关系对等。",
                "可以通过中介 Passage 让远端 Passage 变得有意义。",
                "不要输出仅因共享标签、分类、技术名词或同一主题成立的路径。",
                "inquiry 必须描述源文段引出的求知需求，而不是关键词。",
                "retrievalNotes 必须说明为什么每个非源 Passage 能满足或推进 inquiry。",
                "critique 必须说明这条路径为何不是牵强关系。",
                "strength 取 0 到 1 之间的小数。",
            ],
            "pathTypes": ["question_answer", "gap_fill", "method_transfer", "principle_path", "tradeoff_path", "challenge_path", "application_path"],
            "maxPaths": max_paths,
            "coverageMode": _normalize_text(input_data.get("coverageMode"), 80) or "batch_all_sources",
        },
        "sourcePassages": normalized_sources,
        "corpusPassages": normalized_corpus,
        "existingRelationships": normalized_relationships,
        "expectedJsonShape": {
            "paths": [
                {
                    "sourcePassageId": "source passage id",
                    "passageIds": ["source id", "intermediate or target id"],
                    "pathType": "method_transfer",
                    "title": "简短路径标题",
                    "inquiry": {"question": "读到源文段后自然追问什么", "intentType": "疑问/延伸/反例/应用/前置补足/方法迁移/原理抽象"},
                    "retrievalNotes": ["每一步为什么能满足或推进 inquiry"],
                    "rationale": "整条路径对读者有什么深层发现价值",
                    "critique": "为什么不是牵强的同主题关系",
                    "strength": 0.72,
                }
            ]
        },
    }


def _normalize_deep_path_passage(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _normalize_text(value.get("id"), 80),
        "articleId": _normalize_text(value.get("articleId"), 80),
        "title": _normalize_text(value.get("title"), 120),
        "excerpt": _normalize_text(value.get("excerpt") or value.get("text"), 420),
        "text": _normalize_text(value.get("text"), 1200),
        "keywords": [_normalize_text(item, 40) for item in (value.get("keywords") if isinstance(value.get("keywords"), list) else []) if _normalize_text(item, 40)][:10],
        "articleTitle": _normalize_text(value.get("articleTitle"), 120),
        "articleCategory": _normalize_text(value.get("articleCategory"), 80),
    }


def _normalize_starfield_deep_path_response(value: dict[str, Any]) -> dict[str, Any]:
    paths = value.get("paths") if isinstance(value, dict) else None
    if not isinstance(paths, list):
        raise AiAgentError(502, "LLM response missed paths array")
    normalized = []
    seen: set[tuple[str, ...]] = set()
    allowed_types = {"question_answer", "gap_fill", "method_transfer", "principle_path", "tradeoff_path", "challenge_path", "application_path"}
    for path in paths[:120]:
        if not isinstance(path, dict):
            continue
        source_id = _normalize_text(path.get("sourcePassageId") or path.get("sourceId"), 80)
        passage_ids = [_normalize_text(item, 80) for item in (path.get("passageIds") if isinstance(path.get("passageIds"), list) else [])]
        passage_ids = [item for item in passage_ids if item]
        if source_id and (not passage_ids or passage_ids[0] != source_id):
            passage_ids = [source_id, *[item for item in passage_ids if item != source_id]]
        passage_ids = list(dict.fromkeys(passage_ids))[:4]
        path_type = _normalize_text(path.get("pathType"), 40)
        inquiry = path.get("inquiry") if isinstance(path.get("inquiry"), dict) else {}
        question = _normalize_text(inquiry.get("question") if isinstance(inquiry, dict) else "", 260)
        intent_type = _normalize_text(inquiry.get("intentType") if isinstance(inquiry, dict) else "", 80)
        retrieval_notes = [_normalize_text(item, 220) for item in (path.get("retrievalNotes") if isinstance(path.get("retrievalNotes"), list) else [])]
        retrieval_notes = [item for item in retrieval_notes if item][:8]
        rationale = _normalize_text(path.get("rationale"), 700)
        critique = _normalize_text(path.get("critique"), 500)
        title = _normalize_text(path.get("title"), 120)
        if len(passage_ids) < 2 or not source_id or not question or not rationale or not critique:
            continue
        key = tuple(passage_ids)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(
            {
                "sourcePassageId": source_id,
                "passageIds": passage_ids,
                "pathType": path_type if path_type in allowed_types else "inquiry_path",
                "title": title or question[:80],
                "inquiry": {"question": question, "intentType": intent_type},
                "retrievalNotes": retrieval_notes,
                "rationale": rationale,
                "critique": critique,
                "strength": _safe_strength(path.get("strength")),
            }
        )
    if not normalized:
        raise AiAgentError(502, "LLM response missed valid deep paths")
    return {"paths": normalized}


def _normalize_starfield_canonical_keyword_request(input_data: dict[str, Any]) -> dict[str, Any]:
    passages = input_data.get("passages") if isinstance(input_data, dict) else None
    if not isinstance(passages, list) or not passages:
        raise AiAgentError(400, "Canonical keyword generation requires passages payload")
    normalized_passages = []
    for passage in passages[:240]:
        if not isinstance(passage, dict):
            continue
        passage_id = _normalize_text(passage.get("id"), 80)
        if not passage_id:
            continue
        keywords = _clean_starfield_keywords(passage.get("keywords"))
        if not keywords:
            continue
        normalized_passages.append(
            {
                "id": passage_id,
                "title": _normalize_text(passage.get("title"), 120),
                "keywords": keywords,
                "articleTitle": _normalize_text(passage.get("articleTitle"), 120),
                "articleCategory": _normalize_text(passage.get("articleCategory"), 80),
            }
        )
    if not normalized_passages:
        raise AiAgentError(400, "Canonical keyword generation requires valid passage keywords")
    return {
        "task": "把高度相似的 Passage Keywords 合并为 Canonical Passage Keywords。Canonical Passage Keyword 只作为关系生成证据，不是星图节点。",
        "constraints": {
            "rules": [
                "只合并语义高度相似或同义的标签，不要把宽泛分类合并成大标签。",
                "每个 canonical keyword 至少关联 2 个 Passage。",
                "label 使用简洁、稳定、可读的中文或技术术语。",
                "aliases 保留被合并的原始标签。",
                "passageIds 是拥有这些标签的 Passage id。",
            ],
        },
        "passages": normalized_passages,
    }


def _normalize_starfield_canonical_keyword_response(value: dict[str, Any]) -> dict[str, Any]:
    groups = value.get("canonicalKeywords") if isinstance(value, dict) else None
    if not isinstance(groups, list):
        raise AiAgentError(502, "LLM response missed canonicalKeywords array")
    normalized = []
    seen_labels: set[str] = set()
    for group in groups[:300]:
        if not isinstance(group, dict):
            continue
        label = _normalize_text(group.get("label"), 40)
        aliases = _clean_starfield_keywords(group.get("aliases"))
        passage_ids = [_normalize_text(item, 80) for item in (group.get("passageIds") if isinstance(group.get("passageIds"), list) else [])]
        passage_ids = list(dict.fromkeys([item for item in passage_ids if item]))
        if not label or label in seen_labels or len(passage_ids) < 2:
            continue
        seen_labels.add(label)
        normalized.append({"label": label, "aliases": aliases, "passageIds": passage_ids})
    if not normalized:
        raise AiAgentError(502, "LLM response missed valid canonical keywords")
    return {"canonicalKeywords": normalized}


def _clean_starfield_keywords(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        text = _normalize_text(value, 40)
        if text and text not in result:
            result.append(text)
    return result[:12]


def _safe_strength(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, round(number, 2)))


def _safe_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(fallback or 0)


def _normalize_text(value: Any, max_length: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_length]
