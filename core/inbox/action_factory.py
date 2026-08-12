"""Centralized Action creation helper.

Eliminates duplicated Action construction logic across inbox.py,
smart_cases.py, and other services.
"""

from core.logger import get_logger
from core.models.orm import Action

logger = get_logger(__name__)


def create_inbox_action(
    case_id: str,
    case_client_name: str,
    subject: str,
    sender_display: str,
    has_attachments: bool,
    attachment_count: int,
    action_type_hint: str | None = None,
    ai_summary: str | None = None,
    source_msg_id: str | None = None,
) -> Action:
    """Create an Action card from an inbox email assignment.

    Args:
        case_id: Target case ID.
        case_client_name: Client name for display.
        subject: Email subject (truncated to 40 chars internally).
        sender_display: Formatted sender name/email for display.
        has_attachments: Whether the email has attachments.
        attachment_count: Number of attachments.
        action_type_hint: AI-detected action type.
        ai_summary: AI-generated summary text.
        source_msg_id: 触发该动作的收件箱邮件 ID（用于完成后联动回写）。

    Returns:
        An unsaved Action ORM instance (caller must db.add + db.commit).
    """
    truncated_subject = subject[:40]

    if has_attachments:
        title = f"邮件附件待归档: {truncated_subject}"
        suggestion = (
            f"来自 {sender_display} 的邮件已分配到案件 {case_client_name}。"
            f"包含 {attachment_count} 个附件，请查看并确认文件分类。"
        )
        priority = "medium"
        act_type = "classify"
    else:
        if action_type_hint or ai_summary:
            title = f"AI判定 ({action_type_hint or '未知意图'}): {truncated_subject}"
            suggestion = f"AI 意图判定为【{action_type_hint or '日常沟通'}】。\nAI摘要: {ai_summary or '无'}"
        else:
            title = f"客户信件待处理: {truncated_subject}"
            suggestion = (
                f"来自 {sender_display} 的邮件已分配到案件 {case_client_name}。"
                f"请查看邮件内容并决定后续操作。"
            )
        priority = "low"
        act_type = "CLIENT_REPLY"

    return Action(
        case_id=case_id,
        type=act_type,
        title=title,
        priority=priority,
        status="pending",
        ai_suggestion=suggestion,
        source_msg_id=source_msg_id,
    )
