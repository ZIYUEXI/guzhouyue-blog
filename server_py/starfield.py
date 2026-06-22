from __future__ import annotations

import json
import math
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from .ai_agent import AiAgentError, generate_starfield_canonical_keywords as generate_ai_starfield_canonical_keywords
from .ai_agent import generate_starfield_passages as generate_ai_starfield_passages
from .ai_agent import generate_starfield_relationships as generate_ai_starfield_relationships
from .content import base36, slugify
from .db import get_db, json_parse, now_iso


RELATIONSHIP_TYPES = {"same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"}
RELATIONSHIP_LABELS = {
    "same_topic": "同一主题",
    "prerequisite": "前置知识",
    "further_reading": "延伸阅读",
    "problem_solution": "问题与解法",
    "comparison": "对比关系",
}
PASSAGE_STATUS = {"suggested", "accepted", "hidden"}
RELATIONSHIP_STATUS = {"suggested", "accepted", "hidden"}
STALE_JOB_SECONDS = 30 * 60


def make_id(prefix: str) -> str:
    return f"{prefix}_{base36(int(time.time() * 1000))}_{secrets.token_hex(4)}"


def list_versions() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT v.*,
              COUNT(DISTINCT p.id) AS passage_count,
              COUNT(DISTINCT CASE WHEN p.status = 'accepted' THEN p.id END) AS accepted_passage_count,
              COUNT(DISTINCT r.id) AS relationship_count,
              COUNT(DISTINCT CASE WHEN r.status = 'accepted' THEN r.id END) AS accepted_relationship_count
            FROM starfield_versions v
            LEFT JOIN starfield_passages p ON p.version_id = v.id
            LEFT JOIN starfield_relationships r ON r.version_id = v.id
            GROUP BY v.id
            ORDER BY v.updated_at DESC
            """
        ).fetchall()
    return [_version_row(row) for row in rows]


def create_version(input_data: dict[str, Any]) -> dict[str, Any]:
    now = now_iso()
    version_id = make_id("starfield_version")
    name = str(input_data.get("name") or "星空版本").strip()[:80] or "星空版本"
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO starfield_versions (
              id, name, status, is_active, source_article_ids_json,
              generation_model, generation_prompt_version, created_at, updated_at
            )
            VALUES (?, ?, 'draft', 0, '[]', ?, ?, ?, ?)
            """,
            (version_id, name, str(input_data.get("generationModel") or "local-rule"), "rule-v1", now, now),
        )
    return get_admin_version(version_id)


def get_admin_version(version_id: str) -> dict[str, Any]:
    with get_db() as conn:
        version = conn.execute("SELECT * FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")
        _expire_stale_jobs(conn, version_id)
        passages = conn.execute(
            """
            SELECT p.*, a.slug AS article_slug, a.title AS article_title, ns.name AS article_category
            FROM starfield_passages p
            JOIN articles a ON a.id = p.article_id
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE p.version_id = ?
            ORDER BY p.sort_order ASC, p.created_at ASC
            """,
            (version_id,),
        ).fetchall()
        relationships = conn.execute(
            """
            SELECT r.*
            FROM starfield_relationships r
            WHERE r.version_id = ?
            ORDER BY r.is_cross_article DESC, r.strength DESC, r.created_at ASC
            """,
            (version_id,),
        ).fetchall()
        canonical_keywords = conn.execute(
            """
            SELECT *
            FROM starfield_canonical_keywords
            WHERE version_id = ?
            ORDER BY label ASC, created_at ASC
            """,
            (version_id,),
        ).fetchall()
        jobs = conn.execute(
            """
            SELECT * FROM starfield_generation_jobs
            WHERE version_id = ?
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (version_id,),
        ).fetchall()
    return {
        "version": _version_row(version),
        "passages": [_passage_row(row) for row in passages],
        "relationships": [_relationship_row(row) for row in relationships],
        "canonicalKeywords": [_canonical_keyword_row(row) for row in canonical_keywords],
        "jobs": [_job_row(row) for row in jobs],
    }


def get_public_starfield() -> dict[str, Any]:
    with get_db() as conn:
        version = conn.execute(
            "SELECT * FROM starfield_versions WHERE is_active = 1 AND status = 'published' ORDER BY published_at DESC LIMIT 1"
        ).fetchone()
        if not version:
            return {"version": None, "passages": [], "relationships": []}
        passages = conn.execute(
            """
            SELECT p.*, a.slug AS article_slug, a.title AS article_title, ns.name AS article_category
            FROM starfield_passages p
            JOIN articles a ON a.id = p.article_id
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE p.version_id = ? AND p.status = 'accepted' AND a.status = 'published' AND a.deleted_at IS NULL
            ORDER BY p.sort_order ASC, p.created_at ASC
            """,
            (version["id"],),
        ).fetchall()
        accepted_passage_ids = {row["id"] for row in passages}
        relationship_rows = conn.execute(
            """
            SELECT r.*
            FROM starfield_relationships r
            WHERE r.version_id = ? AND r.status = 'accepted'
            ORDER BY r.is_cross_article DESC, r.strength DESC
            """,
            (version["id"],),
        ).fetchall()
    relationships = [
        _public_relationship_row(row)
        for row in relationship_rows
        if row["source_passage_id"] in accepted_passage_ids and row["target_passage_id"] in accepted_passage_ids
    ]
    public_passages = [_public_passage_row(row, relationships) for row in passages]
    return {
        "version": {
            "id": version["id"],
            "name": version["name"],
            "publishedAt": version["published_at"],
        },
        "passages": public_passages,
        "relationships": relationships,
    }


def enqueue_passage_generation(version_id: str, article_ids: list[str]) -> dict[str, Any]:
    safe_article_ids = [str(article_id) for article_id in article_ids if str(article_id).strip()]
    if not safe_article_ids:
        raise ValueError("No articles selected")
    now = now_iso()
    job_id = make_id("starfield_job")
    with get_db() as conn:
        version = conn.execute("SELECT id FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")
        selected_count = conn.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM articles a
            WHERE a.id IN ({','.join(['?'] * len(safe_article_ids))}) AND a.status = 'published' AND a.deleted_at IS NULL
            """,
            safe_article_ids,
        ).fetchone()["count"]
        if selected_count < 1:
            raise ValueError("No published articles selected")
        conn.execute(
            """
            INSERT INTO starfield_generation_jobs (
              id, version_id, phase, status, selected_article_ids_json,
              progress_current, progress_total, current_step, created_at, updated_at
            )
            VALUES (?, ?, 'passages', 'pending', ?, 0, ?, '任务已创建，等待 AI-agent 开始拆分文段。', ?, ?)
            """,
            (job_id, version_id, json.dumps(safe_article_ids, ensure_ascii=False), selected_count, now, now),
        )
        conn.execute("UPDATE starfield_versions SET source_article_ids_json = ?, updated_at = ? WHERE id = ?", (json.dumps(safe_article_ids, ensure_ascii=False), now, version_id))
    payload = get_admin_version(version_id)
    return {"ok": True, "created": 0, "jobId": job_id, **payload}


async def run_passage_generation_job(job_id: str) -> None:
    try:
        with get_db() as conn:
            job = conn.execute("SELECT * FROM starfield_generation_jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
                return
            version_id = job["version_id"]
            safe_article_ids = [str(article_id) for article_id in json_parse(job["selected_article_ids_json"], []) if str(article_id).strip()]
            rows = conn.execute(
                f"""
                SELECT a.*, ns.name AS category_name
                FROM articles a
                LEFT JOIN note_sections ns ON ns.id = a.category_id
                WHERE a.id IN ({','.join(['?'] * len(safe_article_ids))}) AND a.status = 'published' AND a.deleted_at IS NULL
                """,
                safe_article_ids,
            ).fetchall()
            conn.execute(
                """
                UPDATE starfield_generation_jobs
                SET status = 'running', progress_current = 0, progress_total = ?, current_step = ?, updated_at = ?
                WHERE id = ?
                """,
                (len(rows), "AI-agent 正在读取选中文章，准备拆分 Passage。", now_iso(), job_id),
            )
        await _execute_passage_generation(version_id, job_id, rows, safe_article_ids)
    except Exception as error_value:
        with get_db() as conn:
            conn.execute(
                """
                UPDATE starfield_generation_jobs
                SET status = 'failed', error_message = ?, current_step = 'Passage 生成失败。', updated_at = ?, completed_at = ?
                WHERE id = ?
                """,
                (str(error_value)[:500], now_iso(), now_iso(), job_id),
            )


async def generate_passages(version_id: str, article_ids: list[str]) -> dict[str, Any]:
    payload = enqueue_passage_generation(version_id, article_ids)
    await run_passage_generation_job(payload["jobId"])
    return {"ok": True, **get_admin_version(version_id)}


async def _execute_passage_generation(version_id: str, job_id: str, rows: list[Any], safe_article_ids: list[str]) -> None:
    now = now_iso()
    generated_by_article: dict[str, list[dict[str, Any]]] = {}
    fallback_errors: list[str] = []
    for index, row in enumerate(rows, start=1):
        _update_job_progress(job_id, index - 1, len(rows), f"AI-agent 正在拆分《{row['title']}》的 Passage。")
        try:
            generated_by_article[row["id"]] = await _generate_ai_passages_for_article(row)
        except AiAgentError as error_value:
            fallback_errors.append(f"{row['title']}: {error_value}")
            generated_by_article[row["id"]] = _extract_passages(row)
        except Exception as error_value:
            fallback_errors.append(f"{row['title']}: {error_value}")
            generated_by_article[row["id"]] = _extract_passages(row)
        _update_job_progress(job_id, index, len(rows), f"《{row['title']}》已完成，生成 {len(generated_by_article[row['id']])} 个 Passage 候选。")

    created = 0
    with get_db() as conn:
        created = 0
        for row in rows:
            conn.execute("DELETE FROM starfield_relationships WHERE version_id = ? AND (source_passage_id IN (SELECT id FROM starfield_passages WHERE article_id = ?) OR target_passage_id IN (SELECT id FROM starfield_passages WHERE article_id = ?))", (version_id, row["id"], row["id"]))
            conn.execute("DELETE FROM starfield_passages WHERE version_id = ? AND article_id = ?", (version_id, row["id"]))
            for index, passage in enumerate(generated_by_article.get(row["id"], [])):
                passage_id = make_id("passage")
                conn.execute(
                    """
                    INSERT INTO starfield_passages (
                      id, version_id, article_id, title, text, excerpt, anchor, keywords_json,
                      status, sort_order, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?, ?)
                    """,
                    (
                        passage_id,
                        version_id,
                        row["id"],
                        passage["title"],
                        passage["text"],
                        passage["excerpt"],
                        passage["anchor"],
                        json.dumps(passage["keywords"], ensure_ascii=False),
                        index,
                        now,
                        now,
                    ),
                )
                created += 1
        conn.execute(
            """
            UPDATE starfield_versions
            SET source_article_ids_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(safe_article_ids, ensure_ascii=False), now, version_id),
        )
        conn.execute(
            """
            UPDATE starfield_generation_jobs
            SET status = 'succeeded', progress_current = ?, progress_total = ?, current_step = ?, error_message = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
            """,
            (len(rows), len(rows), f"Passage 生成完成，共创建 {created} 个候选。", _fallback_message(fallback_errors), now_iso(), now_iso(), job_id),
        )


def _update_job_progress(job_id: str, current: int, total: int, step: str) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE starfield_generation_jobs
            SET progress_current = ?, progress_total = ?, current_step = ?, updated_at = ?
            WHERE id = ?
            """,
            (current, total, step[:240], now_iso(), job_id),
        )


def _expire_stale_jobs(conn: Any, version_id: str) -> None:
    now = datetime.now(timezone.utc)
    rows = conn.execute(
        """
        SELECT id, updated_at
        FROM starfield_generation_jobs
        WHERE version_id = ? AND status IN ('pending', 'running')
        """,
        (version_id,),
    ).fetchall()
    expired_ids = [
        row["id"]
        for row in rows
        if _seconds_since(row["updated_at"], now) > STALE_JOB_SECONDS
    ]
    if not expired_ids:
        return

    timestamp = now_iso()
    for job_id in expired_ids:
        conn.execute(
            """
            UPDATE starfield_generation_jobs
            SET status = 'failed',
                current_step = '任务长时间没有更新，已自动标记失败。请重新点击生成。',
                error_message = '任务长时间没有更新，可能是服务重启或后台进程中断。',
                updated_at = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (timestamp, timestamp, job_id),
        )


def _seconds_since(value: str, now: datetime) -> float:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return STALE_JOB_SECONDS + 1
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (now - parsed).total_seconds()


async def generate_relationships(version_id: str) -> dict[str, Any]:
    payload = enqueue_relationship_generation(version_id)
    await run_relationship_generation_job(payload["jobId"])
    return {"ok": True, **get_admin_version(version_id)}


def enqueue_relationship_generation(version_id: str) -> dict[str, Any]:
    now = now_iso()
    job_id = make_id("starfield_job")
    with get_db() as conn:
        version = conn.execute("SELECT id FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")
        passage_count = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM starfield_passages p
            WHERE p.version_id = ? AND p.status = 'accepted'
            """,
            (version_id,),
        ).fetchone()["count"]
        if passage_count < 2:
            raise ValueError("At least two accepted passages are required")
        conn.execute(
            """
            INSERT INTO starfield_generation_jobs (
              id, version_id, phase, status, selected_article_ids_json,
              progress_current, progress_total, current_step, created_at, updated_at
            )
            VALUES (?, ?, 'relationships', 'pending', '[]', 0, 5, '任务已创建，等待 AI-agent 开始生成关系。', ?, ?)
            """,
            (job_id, version_id, now, now),
        )
    return {"ok": True, "created": 0, "jobId": job_id, **get_admin_version(version_id)}


async def run_relationship_generation_job(job_id: str) -> None:
    try:
        with get_db() as conn:
            job = conn.execute("SELECT * FROM starfield_generation_jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
                return
            version_id = job["version_id"]
            passages = conn.execute(
                """
                SELECT p.*, a.title AS article_title, ns.name AS article_category
                FROM starfield_passages p
                JOIN articles a ON a.id = p.article_id
                LEFT JOIN note_sections ns ON ns.id = a.category_id
                WHERE p.version_id = ? AND p.status = 'accepted'
                ORDER BY p.sort_order ASC, p.created_at ASC
                """,
                (version_id,),
            ).fetchall()
            conn.execute(
                """
                UPDATE starfield_generation_jobs
                SET status = 'running', progress_current = 0, progress_total = 5, current_step = ?, updated_at = ?
                WHERE id = ?
                """,
                ("AI-agent 正在读取已接受 Passage，准备归并标签。", now_iso(), job_id),
            )
        await _execute_relationship_generation(version_id, job_id, passages)
    except Exception as error_value:
        with get_db() as conn:
            conn.execute(
                """
                UPDATE starfield_generation_jobs
                SET status = 'failed', error_message = ?, current_step = '关系生成失败。', updated_at = ?, completed_at = ?
                WHERE id = ?
                """,
                (str(error_value)[:500], now_iso(), now_iso(), job_id),
            )


async def _execute_relationship_generation(version_id: str, job_id: str, passages: list[Any]) -> None:
    now = now_iso()
    rows = [_passage_like(row) for row in passages]
    fallback_errors: list[str] = []
    _update_job_progress(job_id, 1, 5, f"AI-agent 正在归并 {len(rows)} 个 Passage 的标签。")
    try:
        canonical_keyword_groups = await _generate_ai_canonical_keyword_groups(rows)
    except AiAgentError as error_value:
        fallback_errors.append(str(error_value))
        canonical_keyword_groups = _canonical_keyword_groups(rows)
    except Exception as error_value:
        fallback_errors.append(str(error_value))
        canonical_keyword_groups = _canonical_keyword_groups(rows)

    _update_job_progress(job_id, 2, 5, f"标签归并完成，得到 {len(canonical_keyword_groups)} 个合并标签，正在生成候选边。")
    candidates = _keyword_bridge_relationships(rows, canonical_keyword_groups)
    _update_job_progress(job_id, 3, 5, f"已生成 {len(candidates)} 条候选边，AI-agent 正在判断关系类型。")
    try:
        scored = await _generate_ai_relationships(rows, candidates)
    except AiAgentError as error_value:
        fallback_errors.append(str(error_value))
        scored = candidates
    except Exception as error_value:
        fallback_errors.append(str(error_value))
        scored = candidates

    _update_job_progress(job_id, 4, 5, f"关系判断完成，正在写入 {len(scored)} 条候选关系。")
    created = 0
    seen_pairs: set[tuple[str, str]] = set()
    per_passage_cross_count: dict[str, int] = {}
    with get_db() as conn:
        created = 0
        seen_pairs: set[tuple[str, str]] = set()
        per_passage_cross_count: dict[str, int] = {}
        conn.execute("DELETE FROM starfield_relationships WHERE version_id = ? AND status = 'suggested'", (version_id,))
        conn.execute("DELETE FROM starfield_canonical_keywords WHERE version_id = ?", (version_id,))
        for group in canonical_keyword_groups:
            keyword_id = make_id("canonical_keyword")
            conn.execute(
                """
                INSERT INTO starfield_canonical_keywords (
                  id, version_id, label, aliases_json, passage_ids_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    keyword_id,
                    version_id,
                    str(group.get("label") or "")[:80],
                    json.dumps(_clean_keywords(group.get("aliases") if isinstance(group.get("aliases"), list) else []), ensure_ascii=False),
                    json.dumps([str(item) for item in group.get("passage_ids", [])], ensure_ascii=False),
                    now,
                    now,
                ),
            )
        for item in scored:
            source = item["source"]
            target = item["target"]
            pair = tuple(sorted([source["id"], target["id"]]))
            if pair in seen_pairs:
                continue
            is_cross_article = source["article_id"] != target["article_id"]
            if is_cross_article:
                if per_passage_cross_count.get(source["id"], 0) >= 9 or per_passage_cross_count.get(target["id"], 0) >= 9:
                    continue
            seen_pairs.add(pair)
            relationship_id = make_id("relationship")
            conn.execute(
                """
                INSERT INTO starfield_relationships (
                  id, version_id, source_passage_id, target_passage_id, relationship_type,
                  rationale, evidence_keywords_json, strength, status, is_cross_article, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    relationship_id,
                    version_id,
                    source["id"],
                    target["id"],
                    item["relationship_type"],
                    item["rationale"],
                    json.dumps(item.get("evidence_keywords", []), ensure_ascii=False),
                    item["strength"],
                    "suggested" if is_cross_article else "hidden",
                    1 if is_cross_article else 0,
                    now,
                    now,
                ),
            )
            if is_cross_article:
                per_passage_cross_count[source["id"]] = per_passage_cross_count.get(source["id"], 0) + 1
                per_passage_cross_count[target["id"]] = per_passage_cross_count.get(target["id"], 0) + 1
            created += 1
        conn.execute(
            """
            UPDATE starfield_generation_jobs
            SET status = 'succeeded', progress_current = 5, progress_total = 5, current_step = ?, error_message = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
            """,
            (f"关系生成完成，共创建 {created} 条候选关系。", _fallback_message(fallback_errors), now_iso(), now_iso(), job_id),
        )
        conn.execute("UPDATE starfield_versions SET updated_at = ? WHERE id = ?", (now_iso(), version_id))


def update_passage(passage_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    now = now_iso()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM starfield_passages WHERE id = ?", (passage_id,)).fetchone()
        if not existing:
            raise ValueError("Passage not found")
        status = input_data.get("status", existing["status"])
        if status not in PASSAGE_STATUS:
            raise ValueError("Invalid passage status")
        title = str(input_data.get("title", existing["title"])).strip()[:120] or existing["title"]
        keywords = input_data.get("keywords")
        if not isinstance(keywords, list):
            keywords = json_parse(existing["keywords_json"], [])
        clean_keywords = _clean_keywords(keywords)
        conn.execute(
            """
            UPDATE starfield_passages
            SET title = ?, keywords_json = ?, status = ?, sort_order = ?, review_note = ?, updated_at = ?,
              reviewed_at = CASE WHEN ? IN ('accepted', 'hidden') THEN ? ELSE reviewed_at END
            WHERE id = ?
            """,
            (
                title,
                json.dumps(clean_keywords, ensure_ascii=False),
                status,
                _safe_int(input_data.get("sortOrder"), existing["sort_order"]),
                str(input_data.get("reviewNote", existing["review_note"]))[:500],
                now,
                status,
                now,
                passage_id,
            ),
        )
        version_id = existing["version_id"]
        conn.execute("UPDATE starfield_versions SET updated_at = ? WHERE id = ?", (now, version_id))
    return get_admin_version(version_id)


def update_passages_bulk(version_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    now = now_iso()
    status = input_data.get("status")
    if status not in PASSAGE_STATUS:
        raise ValueError("Invalid passage status")
    passage_ids = input_data.get("passageIds")
    source_status = input_data.get("sourceStatus")
    if source_status is not None and source_status not in PASSAGE_STATUS:
        raise ValueError("Invalid passage source status")

    with get_db() as conn:
        version = conn.execute("SELECT id FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")

        params: list[Any] = [status, now, status, now, version_id]
        where_parts = ["version_id = ?"]
        if isinstance(passage_ids, list):
            safe_ids = [str(passage_id) for passage_id in passage_ids if str(passage_id).strip()]
            if not safe_ids:
                return get_admin_version(version_id)
            where_parts.append(f"id IN ({','.join(['?'] * len(safe_ids))})")
            params.extend(safe_ids)
        if source_status:
            where_parts.append("status = ?")
            params.append(source_status)

        conn.execute(
            f"""
            UPDATE starfield_passages
            SET status = ?, updated_at = ?,
              reviewed_at = CASE WHEN ? IN ('accepted', 'hidden') THEN ? ELSE reviewed_at END
            WHERE {' AND '.join(where_parts)}
            """,
            params,
        )
        conn.execute("UPDATE starfield_versions SET updated_at = ? WHERE id = ?", (now, version_id))
    return get_admin_version(version_id)


def update_relationship(relationship_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    now = now_iso()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM starfield_relationships WHERE id = ?", (relationship_id,)).fetchone()
        if not existing:
            raise ValueError("Relationship not found")
        status = input_data.get("status", existing["status"])
        if status not in RELATIONSHIP_STATUS:
            raise ValueError("Invalid relationship status")
        relationship_type = input_data.get("relationshipType", existing["relationship_type"])
        if relationship_type not in RELATIONSHIP_TYPES:
            raise ValueError("Invalid relationship type")
        conn.execute(
            """
            UPDATE starfield_relationships
            SET relationship_type = ?, rationale = ?, strength = ?, status = ?, review_note = ?, updated_at = ?,
              reviewed_at = CASE WHEN ? IN ('accepted', 'hidden') THEN ? ELSE reviewed_at END
            WHERE id = ?
            """,
            (
                relationship_type,
                str(input_data.get("rationale", existing["rationale"])).strip()[:500],
                _safe_float(input_data.get("strength"), existing["strength"]),
                status,
                str(input_data.get("reviewNote", existing["review_note"]))[:500],
                now,
                status,
                now,
                relationship_id,
            ),
        )
        version_id = existing["version_id"]
        conn.execute("UPDATE starfield_versions SET updated_at = ? WHERE id = ?", (now, version_id))
    return get_admin_version(version_id)


def update_relationships_bulk(version_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    now = now_iso()
    status = input_data.get("status")
    if status not in RELATIONSHIP_STATUS:
        raise ValueError("Invalid relationship status")
    relationship_ids = input_data.get("relationshipIds")
    source_status = input_data.get("sourceStatus")
    if source_status is not None and source_status not in RELATIONSHIP_STATUS:
        raise ValueError("Invalid relationship source status")
    cross_article_only = bool(input_data.get("crossArticleOnly", True))

    with get_db() as conn:
        version = conn.execute("SELECT id FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")

        params: list[Any] = [status, now, status, now, version_id]
        where_parts = ["version_id = ?"]
        if isinstance(relationship_ids, list):
            safe_ids = [str(relationship_id) for relationship_id in relationship_ids if str(relationship_id).strip()]
            if not safe_ids:
                return get_admin_version(version_id)
            where_parts.append(f"id IN ({','.join(['?'] * len(safe_ids))})")
            params.extend(safe_ids)
        if source_status:
            where_parts.append("status = ?")
            params.append(source_status)
        if cross_article_only:
            where_parts.append("is_cross_article = 1")

        conn.execute(
            f"""
            UPDATE starfield_relationships
            SET status = ?, updated_at = ?,
              reviewed_at = CASE WHEN ? IN ('accepted', 'hidden') THEN ? ELSE reviewed_at END
            WHERE {' AND '.join(where_parts)}
            """,
            params,
        )
        conn.execute("UPDATE starfield_versions SET updated_at = ? WHERE id = ?", (now, version_id))
    return get_admin_version(version_id)


def publish_version(version_id: str) -> dict[str, Any]:
    now = now_iso()
    with get_db() as conn:
        version = conn.execute("SELECT * FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")
        accepted_count = conn.execute("SELECT COUNT(*) AS count FROM starfield_passages WHERE version_id = ? AND status = 'accepted'", (version_id,)).fetchone()["count"]
        if accepted_count < 1:
            raise ValueError("No accepted passages to publish")
        conn.execute("UPDATE starfield_versions SET is_active = 0 WHERE is_active = 1")
        conn.execute(
            """
            UPDATE starfield_versions
            SET status = 'published', is_active = 1, published_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (now, now, version_id),
        )
    return get_admin_version(version_id)


def archive_version(version_id: str) -> dict[str, Any]:
    now = now_iso()
    with get_db() as conn:
        version = conn.execute("SELECT * FROM starfield_versions WHERE id = ?", (version_id,)).fetchone()
        if not version:
            raise ValueError("Starfield version not found")
        conn.execute("UPDATE starfield_versions SET status = 'archived', is_active = 0, updated_at = ? WHERE id = ?", (now, version_id))
    return get_admin_version(version_id)


def _version_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "isActive": bool(row["is_active"]),
        "sourceArticleIds": json_parse(row["source_article_ids_json"], []),
        "generationModel": row["generation_model"],
        "generationPromptVersion": row["generation_prompt_version"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "publishedAt": row["published_at"],
        "passageCount": row["passage_count"] if "passage_count" in row.keys() else None,
        "acceptedPassageCount": row["accepted_passage_count"] if "accepted_passage_count" in row.keys() else None,
        "relationshipCount": row["relationship_count"] if "relationship_count" in row.keys() else None,
        "acceptedRelationshipCount": row["accepted_relationship_count"] if "accepted_relationship_count" in row.keys() else None,
    }


def _passage_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "versionId": row["version_id"],
        "articleId": row["article_id"],
        "article": {
            "id": row["article_id"],
            "slug": row["article_slug"] if "article_slug" in row.keys() else "",
            "title": row["article_title"] if "article_title" in row.keys() else "",
            "category": row["article_category"] if "article_category" in row.keys() else "",
        },
        "title": row["title"],
        "text": row["text"],
        "excerpt": row["excerpt"],
        "anchor": row["anchor"],
        "keywords": json_parse(row["keywords_json"], []),
        "status": row["status"],
        "sortOrder": row["sort_order"],
        "reviewNote": row["review_note"],
        "embeddingRef": row["embedding_ref"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "reviewedAt": row["reviewed_at"],
    }


def _public_passage_row(row: Any, relationships: list[dict[str, Any]]) -> dict[str, Any]:
    connected = [item for item in relationships if item["sourcePassageId"] == row["id"] or item["targetPassageId"] == row["id"]]
    cross_count = sum(1 for item in connected if item["isCrossArticle"])
    return {
        "id": row["id"],
        "title": row["title"],
        "text": row["text"],
        "excerpt": row["excerpt"],
        "anchor": row["anchor"],
        "keywords": json_parse(row["keywords_json"], []),
        "article": {
            "id": row["article_id"],
            "slug": row["article_slug"],
            "title": row["article_title"],
            "category": row["article_category"] or "",
        },
        "starSize": round(1 + min(1.4, math.log(1 + len(connected) + cross_count) / 2), 2),
        "starColorKey": row["article_category"] or "未分类",
    }


def _relationship_row(row: Any) -> dict[str, Any]:
    relationship_type = row["relationship_type"]
    return {
        "id": row["id"],
        "versionId": row["version_id"],
        "sourcePassageId": row["source_passage_id"],
        "targetPassageId": row["target_passage_id"],
        "relationshipType": relationship_type,
        "relationshipLabel": RELATIONSHIP_LABELS.get(relationship_type, relationship_type),
        "rationale": row["rationale"],
        "evidenceKeywords": json_parse(row["evidence_keywords_json"] if "evidence_keywords_json" in row.keys() else None, []),
        "strength": row["strength"],
        "status": row["status"],
        "isCrossArticle": bool(row["is_cross_article"]),
        "reviewNote": row["review_note"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "reviewedAt": row["reviewed_at"],
    }


def _public_relationship_row(row: Any) -> dict[str, Any]:
    relationship_type = row["relationship_type"]
    return {
        "id": row["id"],
        "sourcePassageId": row["source_passage_id"],
        "targetPassageId": row["target_passage_id"],
        "relationshipType": relationship_type,
        "relationshipLabel": RELATIONSHIP_LABELS.get(relationship_type, relationship_type),
        "rationale": row["rationale"],
        "evidenceKeywords": json_parse(row["evidence_keywords_json"] if "evidence_keywords_json" in row.keys() else None, []),
        "strength": row["strength"],
        "isCrossArticle": bool(row["is_cross_article"]),
    }


def _canonical_keyword_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "versionId": row["version_id"],
        "label": row["label"],
        "aliases": json_parse(row["aliases_json"], []),
        "passageIds": json_parse(row["passage_ids_json"], []),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _job_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "versionId": row["version_id"],
        "phase": row["phase"],
        "status": row["status"],
        "selectedArticleIds": json_parse(row["selected_article_ids_json"], []),
        "progressCurrent": row["progress_current"] if "progress_current" in row.keys() else 0,
        "progressTotal": row["progress_total"] if "progress_total" in row.keys() else 0,
        "currentStep": row["current_step"] if "current_step" in row.keys() else "",
        "errorMessage": row["error_message"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "completedAt": row["completed_at"],
    }


async def _generate_ai_passages_for_article(article: Any) -> list[dict[str, Any]]:
    payload = await generate_ai_starfield_passages(
        {
            "article": {
                "id": article["id"],
                "title": article["title"],
                "category": article["category_name"] or "",
                "tags": json_parse(article["tags_json"], []),
                "bodyMarkdown": article["body_markdown"] or "",
            }
        }
    )
    article_group = next((item for item in payload.get("articles", []) if item.get("articleId") in {"", article["id"]}), None)
    passages = article_group.get("passages", []) if isinstance(article_group, dict) else []
    normalized = _normalize_ai_passages(article, passages)
    if len(normalized) < 3:
        raise AiAgentError(502, "LLM did not return enough locatable passages")
    return normalized


async def _generate_ai_canonical_keyword_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = await generate_ai_starfield_canonical_keywords(
        {
            "passages": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "keywords": row["keywords"],
                    "articleTitle": row["article_title"],
                    "articleCategory": row["article_category"],
                }
                for row in rows
            ]
        }
    )
    valid_ids = {row["id"] for row in rows}
    groups = []
    for group in payload.get("canonicalKeywords", []):
        label = str(group.get("label") or "").strip()
        aliases = _clean_keywords(group.get("aliases") if isinstance(group.get("aliases"), list) else [])
        passage_ids = [str(item) for item in group.get("passageIds", []) if str(item) in valid_ids]
        if label and len(set(passage_ids)) >= 2:
            groups.append({"label": label[:40], "aliases": aliases, "passage_ids": list(dict.fromkeys(passage_ids))})
    if not groups:
        raise AiAgentError(502, "LLM did not return usable canonical keywords")
    return groups


async def _generate_ai_relationships(rows: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not candidates:
        return []
    payload = await generate_ai_starfield_relationships(
        {
            "passages": [
                {
                    "id": row["id"],
                    "articleId": row["article_id"],
                    "title": row["title"],
                    "text": row["text"],
                    "excerpt": _excerpt(row["text"]),
                    "keywords": row["keywords"],
                    "articleTitle": row["article_title"],
                    "articleCategory": row["article_category"],
                }
                for row in rows
            ],
            "candidates": [
                {
                    "sourcePassageId": item["source"]["id"],
                    "targetPassageId": item["target"]["id"],
                    "evidenceKeywords": item.get("evidence_keywords", []),
                    "relationshipType": item["relationship_type"],
                    "rationale": item["rationale"],
                    "strength": item["strength"],
                }
                for item in candidates[:500]
            ],
        }
    )
    by_id = {row["id"]: row for row in rows}
    by_pair = {tuple(sorted([item["source"]["id"], item["target"]["id"]])): item for item in candidates}
    upgraded_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for item in payload.get("relationships", []):
        source = by_id.get(item.get("sourcePassageId"))
        target = by_id.get(item.get("targetPassageId"))
        relationship_type = item.get("relationshipType")
        if not source or not target or source["id"] == target["id"] or relationship_type not in RELATIONSHIP_TYPES:
            continue
        pair = tuple(sorted([source["id"], target["id"]]))
        base_candidate = by_pair.get(pair)
        if not base_candidate:
            continue
        evidence_keywords = _clean_keywords(item.get("evidenceKeywords") if isinstance(item.get("evidenceKeywords"), list) else base_candidate.get("evidence_keywords", []))
        upgraded_by_pair[pair] = {
            "source": source,
            "target": target,
            "relationship_type": relationship_type,
            "rationale": str(item.get("rationale") or base_candidate["rationale"])[:500],
            "strength": _safe_float(item.get("strength"), base_candidate["strength"]),
            "evidence_keywords": evidence_keywords or base_candidate.get("evidence_keywords", []),
        }
    if not upgraded_by_pair:
        raise AiAgentError(502, "LLM did not return usable relationships")
    scored = [upgraded_by_pair.get(tuple(sorted([item["source"]["id"], item["target"]["id"]])), item) for item in candidates]
    return sorted(scored, key=lambda item: (item["source"]["article_id"] != item["target"]["article_id"], item["strength"]), reverse=True)


def _normalize_ai_passages(article: Any, passages: list[Any]) -> list[dict[str, Any]]:
    markdown = str(article["body_markdown"] or "")
    collapsed_markdown = _collapse_for_match(markdown)
    used_anchors: set[str] = set()
    result = []
    for index, passage in enumerate(passages[:12]):
        if not isinstance(passage, dict):
            continue
        raw_text = str(passage.get("text") or "")
        text = _clean_passage_text(raw_text)
        if not text:
            continue
        if _collapse_for_match(text) not in collapsed_markdown:
            continue
        title = str(passage.get("title") or "").strip()[:80] or f"{article['title']}片段{index + 1}"
        anchor_hint = str(passage.get("anchorHint") or "").strip()
        anchor_base = f"passage-{slugify(anchor_hint)}" if _heading_exists(markdown, anchor_hint) else f"passage-id-{index + 1}"
        anchor = _unique_anchor(anchor_base, used_anchors)
        keywords = _clean_keywords([article["category_name"] or "", *json_parse(article["tags_json"], []), *(passage.get("keywords") if isinstance(passage.get("keywords"), list) else [])])
        if not keywords:
            keywords = _keywords_from_text(f"{title} {text}")
        result.append(
            {
                "title": title,
                "text": text,
                "excerpt": str(passage.get("excerpt") or "").strip()[:180] or _excerpt(text),
                "anchor": anchor,
                "keywords": keywords,
            }
        )
    return result[:12]


def _collapse_for_match(value: str) -> str:
    return re.sub(r"\s+", "", value)


def _heading_exists(markdown: str, title: str) -> bool:
    if not title.strip():
        return False
    escaped = re.escape(title.strip())
    return bool(re.search(rf"^#{{1,4}}\s+{escaped}\s*$", markdown, flags=re.M))


def _fallback_message(errors: list[str]) -> str:
    if not errors:
        return ""
    return ("LLM 生成不可用，已使用本地规则兜底：" + "；".join(errors))[:500]


def _extract_passages(article: Any) -> list[dict[str, Any]]:
    markdown = str(article["body_markdown"] or "")
    sections = _split_markdown_sections(markdown)
    if len(sections) < 3:
        sections = _split_plain_passages(markdown)
    selected = sections[:12]
    while len(selected) < 3 and selected:
        selected.append(selected[-1])
    result = []
    used_anchors: set[str] = set()
    for index, section in enumerate(selected[:12]):
        title = section["title"] or f"{article['title']}片段{index + 1}"
        text = _clean_passage_text(section["text"])
        if not text:
            continue
        anchor_base = f"passage-{slugify(title)}" if section["title"] else f"passage-id-{index + 1}"
        anchor = _unique_anchor(anchor_base, used_anchors)
        result.append(
            {
                "title": title[:80],
                "text": text,
                "excerpt": _excerpt(text),
                "anchor": anchor,
                "keywords": _clean_keywords([article["category_name"] or "", *json_parse(article["tags_json"], []), *_keywords_from_text(f"{title} {text}")]),
            }
        )
    return result[:12]


def _split_markdown_sections(markdown: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    current_title = ""
    current_lines: list[str] = []
    for line in markdown.splitlines():
        heading = re.match(r"^(#{1,4})\s+(.+)$", line.strip())
        if heading:
            if current_lines:
                sections.append({"title": current_title, "text": "\n".join(current_lines).strip()})
            current_title = heading.group(2).strip()
            current_lines = [line]
            continue
        current_lines.append(line)
    if current_lines:
        sections.append({"title": current_title, "text": "\n".join(current_lines).strip()})
    return [section for section in sections if len(re.sub(r"\s", "", section["text"])) >= 40]


def _split_plain_passages(markdown: str) -> list[dict[str, str]]:
    paragraphs = [item.strip() for item in re.split(r"\n{2,}", markdown) if len(re.sub(r"\s", "", item)) >= 30]
    if not paragraphs:
        return []
    target_count = min(12, max(3, len(paragraphs)))
    chunks = []
    chunk_size = max(1, math.ceil(len(paragraphs) / target_count))
    for index in range(0, len(paragraphs), chunk_size):
        text = "\n\n".join(paragraphs[index : index + chunk_size])
        chunks.append({"title": "", "text": text})
    return chunks


def _clean_passage_text(text: str) -> str:
    cleaned = text.strip()
    return cleaned[:1800]


def _excerpt(text: str) -> str:
    plain = re.sub(r"[#>*_`\-\[\]()!]", " ", text)
    plain = re.sub(r"\s+", " ", plain).strip()
    return plain[:180]


def _keywords_from_text(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#.\-]{1,24}|[\u4e00-\u9fa5]{2,8}", text)
    stopwords = {"这个", "一种", "通过", "可以", "需要", "实现", "使用", "系统", "文章", "内容", "时候", "进行", "用于"}
    result = []
    for token in tokens:
        if token in stopwords:
            continue
        if token not in result:
            result.append(token)
    return result[:10]


def _clean_keywords(values: list[Any]) -> list[str]:
    result = []
    for value in values:
        text = re.sub(r"\s+", " ", str(value or "")).strip()[:40]
        if text and text not in result:
            result.append(text)
    return result[:12]


def _unique_anchor(base: str, used: set[str]) -> str:
    anchor = base or "passage"
    suffix = 2
    while anchor in used:
        anchor = f"{base}-{suffix}"
        suffix += 1
    used.add(anchor)
    return anchor


def _canonical_keyword_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keyword_passages: dict[str, list[str]] = {}
    keyword_aliases: dict[str, list[str]] = {}
    for row in rows:
        for keyword in row["keywords"]:
            canonical = _canonicalize_keyword(keyword)
            if not canonical or _is_generic_keyword(canonical):
                continue
            keyword_passages.setdefault(canonical, [])
            if row["id"] not in keyword_passages[canonical]:
                keyword_passages[canonical].append(row["id"])
            keyword_aliases.setdefault(canonical, [])
            if keyword not in keyword_aliases[canonical]:
                keyword_aliases[canonical].append(keyword)

    groups = []
    max_passages_per_keyword = max(6, math.ceil(len(rows) * 0.45))
    for canonical, passage_ids in keyword_passages.items():
        if len(passage_ids) < 2 or len(passage_ids) > max_passages_per_keyword:
            continue
        groups.append(
            {
                "label": _label_from_aliases(canonical, keyword_aliases.get(canonical, [])),
                "aliases": keyword_aliases.get(canonical, [])[:8],
                "passage_ids": passage_ids,
            }
        )
    return groups


def _keyword_bridge_relationships(rows: list[dict[str, Any]], canonical_keyword_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {row["id"]: row for row in rows}
    pair_keywords: dict[tuple[str, str], list[str]] = {}
    for group in canonical_keyword_groups:
        label = str(group.get("label") or "").strip()
        passage_ids = [passage_id for passage_id in group.get("passage_ids", []) if passage_id in by_id]
        if not label or len(passage_ids) < 2:
            continue
        for index, source_id in enumerate(passage_ids):
            for target_id in passage_ids[index + 1 :]:
                pair = tuple(sorted([source_id, target_id]))
                pair_keywords.setdefault(pair, [])
                if label not in pair_keywords[pair]:
                    pair_keywords[pair].append(label)

    candidates = []
    for (source_id, target_id), evidence_keywords in pair_keywords.items():
        source = by_id[source_id]
        target = by_id[target_id]
        shared_count = len(evidence_keywords)
        same_article = source["article_id"] == target["article_id"]
        strength = min(1, 0.36 + shared_count * 0.16 + (0.12 if not same_article else 0))
        candidates.append(
            {
                "source": source,
                "target": target,
                "relationship_type": "same_topic",
                "rationale": _build_rationale(source, target, "same_topic", evidence_keywords),
                "strength": round(strength, 2),
                "evidence_keywords": evidence_keywords[:6],
            }
        )
    return sorted(candidates, key=lambda item: (item["source"]["article_id"] != item["target"]["article_id"], item["strength"]), reverse=True)


def _canonicalize_keyword(value: str) -> str:
    text = re.sub(r"\s+", "", str(value or "").strip().lower())
    text = re.sub(r"[^\w#.+\-\u4e00-\u9fa5]", "", text)
    suffixes = ("相关", "实践", "方法", "技巧", "内容", "知识", "基础", "概念")
    for suffix in suffixes:
        if len(text) > len(suffix) + 2 and text.endswith(suffix):
            text = text[: -len(suffix)]
    return text[:40]


def _is_generic_keyword(value: str) -> bool:
    generic = {"技术", "技术笔记", "笔记", "博客", "文章", "内容", "开发", "配置", "系统", "方法", "实践", "经验", "问题"}
    return value in generic or len(value) < 2


def _label_from_aliases(canonical: str, aliases: list[str]) -> str:
    clean_aliases = _clean_keywords(aliases)
    if clean_aliases:
        return min(clean_aliases, key=lambda item: (len(item), item))
    return canonical


def _passage_like(row: Any) -> dict[str, Any]:
    keywords = _clean_keywords(json_parse(row["keywords_json"], []))
    if not keywords:
        keywords = _keywords_from_text(f"{row['title']} {row['text']}")
    return {
        "id": row["id"],
        "article_id": row["article_id"],
        "title": row["title"],
        "text": row["text"],
        "keywords": keywords,
        "article_title": row["article_title"],
        "article_category": row["article_category"],
    }


def _build_rationale(source: dict[str, Any], target: dict[str, Any], relationship_type: str, overlap: list[str]) -> str:
    label = RELATIONSHIP_LABELS.get(relationship_type, "相关")
    if overlap:
        return f"{label}：两个文段都涉及{ '、'.join(overlap[:3]) }，适合跨文章继续阅读。"
    return f"{label}：两个文段来自同一篇文章，可作为局部上下文参考。"


def _safe_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(fallback or 0)


def _safe_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(fallback or 1)
    return max(0, min(1, number))
