from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .content import get_llm_settings, record_llm_token_usage


COMPATIBLE_PROVIDERS = {"deepseek", "openai", "moonshot", "qwen", "zhipu", "custom"}
MAX_BODY_CHARACTERS = 12000


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


async def generate_starfield_relationships(input_data: dict[str, Any]) -> dict[str, Any]:
    payload = await _chat_json_completion(
        "starfield_relationships",
        "你是中文博客的知识关系助手。只返回严格 JSON，不要 Markdown，不要解释。JSON 顶层字段必须是 relationships。",
        _normalize_starfield_relationship_request(input_data),
    )
    return _normalize_starfield_relationship_response(payload)


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
    if not isinstance(passages, list) or not passages:
        raise AiAgentError(400, "Starfield relationship generation requires passages payload")
    normalized_passages = []
    for passage in passages[:180]:
        if not isinstance(passage, dict):
            continue
        passage_id = _normalize_text(passage.get("id"), 80)
        article_id = _normalize_text(passage.get("articleId"), 80)
        if not passage_id or not article_id:
            continue
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
    return {
        "task": "为 Passage 之间挑选最重要的知识关系，优先跨文章关系。",
        "constraints": {
            "relationshipTypes": ["same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"],
            "maxCrossArticlePerPassage": 9,
            "rules": [
                "优先选择不同文章之间的关系。",
                "同一对 Passage 只输出一次，不要重复。",
                "rationale 必须说明为什么这两个 Passage 相关。",
                "strength 取 0 到 1 之间的小数。",
            ],
        },
        "passages": normalized_passages,
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
        strength = _safe_strength(relationship.get("strength"))
        if not source_id or not target_id or source_id == target_id or relationship_type not in {"same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"}:
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
                "strength": strength,
            }
        )
    if not normalized:
        raise AiAgentError(502, "LLM response missed valid relationships")
    return {"relationships": normalized}


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


def _normalize_text(value: Any, max_length: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_length]
