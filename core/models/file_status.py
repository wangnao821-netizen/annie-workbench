"""统一文件状态词汇表（审计 P2-6）。

历史问题：CaseFile.status 存在三套并存的写法——pipeline 用 FileState 枚举
（大写），导入/建案写小写（pending/discovered/dismissed/verified），查询处
又各自硬编码（DISCOVERED/NEEDS_REVIEW/APPROVED...），大小写与叫法都不统一。

本模块是 CaseFile.status 的**唯一事实来源**：所有写入使用 FileStatus 枚举值，
所有读取使用本模块的常量集合；normalize() 兼容历史小写值，避免旧数据误判。
"""

from __future__ import annotations

from enum import Enum


class FileStatus(str, Enum):
    """CaseFile.status 的规范取值（全部大写）。"""

    # ── 处理管线（与 pipeline_state.FileState 对应）──
    DISCOVERED = "DISCOVERED"
    PARSED = "PARSED"
    EXTRACTED = "EXTRACTED"
    ANALYZED = "ANALYZED"
    REPORTED = "REPORTED"
    FAILED = "FAILED"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"
    SKIPPED = "SKIPPED"

    # ── 人工/确认状态 ──
    PENDING = "PENDING"  # 导入后待处理
    APPROVED = "APPROVED"
    MANUALLY_CLASSIFIED = "MANUALLY_CLASSIFIED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    DISMISSED = "DISMISSED"

    @staticmethod
    def normalize(value: str | None) -> str | None:
        """把任意写法（大小写/历史别名）归一为规范值；无法识别返回原值大写。"""
        if value is None:
            return None
        v = str(value).strip().upper()
        aliases = {
            "NEEDS_REVIEW": FileStatus.NEEDS_MANUAL_REVIEW.value,  # 历史别名
            "MANUALLY_CLASSIFIED": FileStatus.MANUALLY_CLASSIFIED.value,
            "PENDING": FileStatus.PENDING.value,
        }
        if v in aliases:
            return aliases[v]
        for fs in FileStatus:
            if fs.value == v:
                return fs.value
        return v


# 已确认/可用（参与清单候选与"已收"判定）
CONFIRMED_STATES: frozenset[str] = frozenset(
    {FileStatus.APPROVED.value, FileStatus.MANUALLY_CLASSIFIED.value, FileStatus.VERIFIED.value}
)

# 处理中/待处理（未完成 OCR 或待人工）
ACTIVE_PROCESSING_STATES: frozenset[str] = frozenset(
    {
        FileStatus.DISCOVERED.value,
        FileStatus.PARSED.value,
        FileStatus.EXTRACTED.value,
        FileStatus.ANALYZED.value,
        FileStatus.FAILED.value,
        FileStatus.NEEDS_MANUAL_REVIEW.value,
        FileStatus.PENDING.value,
    }
)

# 忽略/终结（不参与处理队列）
IGNORED_STATES: frozenset[str] = frozenset(
    {FileStatus.SKIPPED.value, FileStatus.REJECTED.value, FileStatus.DISMISSED.value}
)

# 今日行动"待处理文件"排除集（已确认 + 已忽略都不算待处理）
PENDING_FILES_EXCLUDE: frozenset[str] = CONFIRMED_STATES | IGNORED_STATES
