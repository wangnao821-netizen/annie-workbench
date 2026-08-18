"""Mem0 memory integration for loan-assistant V4.

Provides remember / remember_experience / recall functions.
All content is desensitized before being sent to Mem0 (external),
and rehydrated before being returned to Vera.

Mem0 的 LLM 使用 DeepSeek（主力），配置 DEEPSEEK_API_KEY；
向量嵌入使用 Google text-embedding-004（DeepSeek 无嵌入 API），
配置 GEMINI_API_KEY；DeepSeek key 缺失时 LLM 自动退回 Gemini。

Red Line compliance:
    - desensitize() is called before ANY mem0.add() call.
    - rehydrate() is called on ALL mem0.search() results.
    - pii_map never leaves the internal network.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

# server.deps.get_project_root 的本地替代
def get_project_root() -> Path:
    """返回项目根目录（从 core/knowledge/memory.py 向上 3 层）。"""
    return Path(__file__).resolve().parent.parent.parent

from core.pii.gateway import desensitize, rehydrate
from core.logger import get_logger

logger = get_logger(__name__)

# ── Mem0 Client Singleton ────────────────────────────────────────────

_mem0_client: Any | None = None
_mem0_init_attempted: bool = False

MEM0_DATA_DIR = get_project_root() / "data" / "mem0"


def _get_mem0() -> Any | None:
    """Initialize and return the Mem0 Memory client (singleton).

    Returns None if Mem0 cannot be initialized (missing API key,
    import error, etc.). The caller must handle None gracefully.

    Returns:
        A mem0.Memory instance, or None.
    """
    global _mem0_client, _mem0_init_attempted

    if _mem0_init_attempted:
        return _mem0_client

    _mem0_init_attempted = True

    try:
        from mem0 import Memory  # type: ignore[import-untyped]

        MEM0_DATA_DIR.mkdir(parents=True, exist_ok=True)

        # 主力：DeepSeek LLM（记忆摘要/抽取）；Gemini 仅作为备用（LLM 缺 key 时退回）
        deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if not deepseek_key or deepseek_key.startswith("your_"):
            llm_config = {
                "provider": "gemini",
                "config": {
                    "model": "gemini-2.0-flash",
                    "api_key": gemini_key,
                },
            }
            embedder_config = {
                "provider": "gemini",
                "config": {
                    "model": "models/gemini-embedding-001",
                    "api_key": gemini_key,
                },
            }
        else:
            llm_config = {
                "provider": "deepseek",
                "config": {
                    "model": "deepseek-v4-flash",
                    "api_key": deepseek_key,
                },
            }
            # DeepSeek 不提供向量嵌入 API，嵌入继续用 Google（Gemini 备用/嵌入专用）
            embedder_config = {
                "provider": "gemini",
                "config": {
                    "model": "models/gemini-embedding-001",
                    "api_key": gemini_key,
                },
            }

        config = {
            "llm": llm_config,
            "embedder": embedder_config,
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": "loan_assistant",
                    "path": str(MEM0_DATA_DIR),
                },
            },
        }

        _mem0_client = Memory.from_config(config)
        provider_label = llm_config["provider"]
        logger.info("Mem0 memory system initialized (%s LLM + Google embedder + ChromaDB)", provider_label)
        return _mem0_client

    except ImportError:
        logger.warning("Mem0 依赖不完整（缺少 chromadb 等向量库后端）— 软记忆禁用，经验沉淀走本地表")
        return None
    except Exception as exc:
        logger.warning("Mem0 init failed: %s — memory disabled", exc)
        return None


def reset_mem0() -> None:
    """Reset the Mem0 singleton (for testing only)."""
    global _mem0_client, _mem0_init_attempted
    _mem0_client = None
    _mem0_init_attempted = False


# ── Public API (signatures fixed by construction order) ──────────────


def remember(case_id: str, content: str, db: Session) -> None:
    """Store content as client-level memory (user_id = case_id).

    Flow: desensitize → mem0.add (with desensitized text).

    Args:
        case_id: The case identifier (used as Mem0 user_id).
        content: Raw content to remember (may contain PII).
        db: SQLAlchemy session for pii_map operations.
    """
    safe_text = desensitize(content, case_id, db)
    logger.debug(
        "remember(case_id=%s): desensitized %d chars → %d chars",
        case_id, len(content), len(safe_text),
    )

    mem0 = _get_mem0()
    if mem0 is None:
        logger.warning("Mem0 unavailable — remember() is a no-op")
        return

    try:
        mem0.add(safe_text, user_id=case_id)
        logger.info("Stored client memory for case %s", case_id)
    except Exception as exc:
        logger.warning("Mem0 add failed for case %s: %s", case_id, exc)


def remember_experience(content: str, db: Session, case_id: str) -> None:
    """Store content as global experience (agent_id = global_experience).

    Flow: desensitize → mem0.add (with agent_id="global_experience").

    Args:
        content: Raw experience content (may contain PII).
        db: SQLAlchemy session for pii_map operations.
        case_id: Case context for desensitization scoping.
    """
    safe_text = desensitize(content, case_id, db)
    logger.debug("remember_experience: desensitized %d chars", len(content))

    mem0 = _get_mem0()
    if mem0 is None:
        logger.warning("Mem0 unavailable — remember_experience() is a no-op")
        return

    try:
        mem0.add(safe_text, agent_id="global_experience")
        logger.info("Stored global experience memory")
    except Exception as exc:
        logger.warning("Mem0 add (global experience) failed: %s", exc)


def recall(case_id: str, query: str, db: Session) -> str:
    """Search client + global memories and return rehydrated results.

    Flow:
        1. mem0.search(query, user_id=case_id)  — client memories
        2. mem0.search(query, agent_id="global_experience") — global
        3. Merge results, rehydrate, return plain-text string.

    Args:
        case_id: The case identifier to search client memories.
        query: Search query (natural language).
        db: SQLAlchemy session for rehydration.

    Returns:
        Merged and rehydrated plain-text results.
        Returns empty string if Mem0 is unavailable or no results found.
    """
    mem0 = _get_mem0()
    if mem0 is None:
        logger.warning("Mem0 unavailable — recall() returns empty")
        return ""

    results: list[str] = []

    try:
        # Client-level memories
        client_results = mem0.search(query, user_id=case_id)
        if isinstance(client_results, dict) and "results" in client_results:
            for item in client_results["results"]:
                if "memory" in item:
                    results.append(item["memory"])
        elif isinstance(client_results, list):
            for item in client_results:
                if isinstance(item, dict) and "memory" in item:
                    results.append(item["memory"])
    except Exception as exc:
        logger.warning("Mem0 search (client) failed for %s: %s", case_id, exc)

    try:
        # Global experience memories
        global_results = mem0.search(query, agent_id="global_experience")
        if isinstance(global_results, dict) and "results" in global_results:
            for item in global_results["results"]:
                if "memory" in item:
                    results.append(item["memory"])
        elif isinstance(global_results, list):
            for item in global_results:
                if isinstance(item, dict) and "memory" in item:
                    results.append(item["memory"])
    except Exception as exc:
        logger.warning("Mem0 search (global) failed: %s", exc)

    if not results:
        return ""

    # Merge and rehydrate
    merged = "\n".join(results)
    rehydrated = rehydrate(merged, case_id, db)
    return rehydrated
