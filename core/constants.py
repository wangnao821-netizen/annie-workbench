"""全局常量 — 所有模块从这里导入，不再各自定义。"""

from __future__ import annotations

# 案件终态集合（中英文双覆盖）
TERMINAL_STAGES: frozenset[str] = frozenset({
    "已结算", "已终止", "已撤回", "已拒绝", "已重递",
    "settled", "terminated", "withdrawn", "declined", "resubmitted",
})

# 案件阶段优先级排序（用于任务队列排序）
STAGE_PRIORITY: dict[str, int] = {
    "收集资料": 1,
    "已递交": 2,
    "银行补件": 3,
    "有条件批准": 4,
    "正式批准": 5,
    "已结算": 99,
    "已终止": 99,
    "已撤回": 99,
    "已拒绝": 99,
    "已重递": 99,
}
