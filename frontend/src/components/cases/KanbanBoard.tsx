import { useState, useRef } from 'react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import {
  CaseStageCategory,
  KANBAN_COLUMN_STAGE,
  STAGE_KEY_LABEL,
  stageCategoryFromStage,
} from '../../services/caseMapper';
import { updateCaseStage } from '../../services/api/cases';
import { KanbanColumn } from './KanbanColumn';
import { useToastStore } from '../../stores/toastStore';

interface KanbanBoardProps {
  cases: CaseInfo[];
  onCardClick: (c: CaseInfo) => void;
}

const KANBAN_STAGES: CaseStageCategory[] = [
  'pre_review',
  'submitted',
  'os_condition',
  'approval',
  'settlement',
];

const STAGE_NAMES: Record<CaseStageCategory, string> = {
  all: '全部',
  pre_review: '预审阶段',
  submitted: '递件阶段',
  os_condition: '补件/OS条件',
  approval: '审批批复',
  settlement: '结算 (Settlement)',
};

const STAGE_DEFAULT_STRINGS: Record<CaseStageCategory, string> = {
  all: '全部',
  pre_review: '材料收集/预审',
  submitted: '已递交/审核中',
  os_condition: '补件/OS条件',
  approval: '已批准 (Conditional/Unconditional)',
  settlement: '已结算 (Settled)',
};

export function KanbanBoard({ cases, onCardClick }: KanbanBoardProps) {
  const showToast = useToastStore((s) => s.showToast);
  const [localCases, setLocalCases] = useState<CaseInfo[]>(cases);

  // Sync if prop cases change
  const currentCases = cases.map((c) => {
    const overridden = localCases.find((l) => l.caseId === c.caseId);
    return overridden || c;
  });

  const [draggingCaseId, setDraggingCaseId] = useState<string | null>(null);
  const [dragTargetStage, setDragTargetStage] = useState<CaseStageCategory | null>(null);
  const savingRef = useRef(false);

  const dragInfoRef = useRef<{
    caseItem: CaseInfo | null;
    startX: number;
    startY: number;
    isMoved: boolean;
  }>({
    caseItem: null,
    startX: 0,
    startY: 0,
    isMoved: false,
  });

  const handlePointerDown = (c: CaseInfo, e: React.PointerEvent) => {
    dragInfoRef.current = {
      caseItem: c,
      startX: e.clientX,
      startY: e.clientY,
      isMoved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfoRef.current.caseItem) return;

    const dx = Math.abs(e.clientX - dragInfoRef.current.startX);
    const dy = Math.abs(e.clientY - dragInfoRef.current.startY);

    if (dx > 5 || dy > 5) {
      dragInfoRef.current.isMoved = true;
      setDraggingCaseId(dragInfoRef.current.caseItem.caseId);

      // Find column element under current pointer
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const columnEl = elements.find((el) => el.hasAttribute('data-stage'));
      if (columnEl) {
        const stageAttr = columnEl.getAttribute('data-stage') as CaseStageCategory;
        setDragTargetStage(stageAttr);
      } else {
        setDragTargetStage(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const dragItem = dragInfoRef.current.caseItem;
    if (!dragItem) return;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture release fails
    }

    if (dragInfoRef.current.isMoved && dragTargetStage) {
      const origStage = stageCategoryFromStage(dragItem.stage);
      if (dragTargetStage !== origStage && !savingRef.current) {
        const origStageStr = dragItem.stage;
        const newStageKey = KANBAN_COLUMN_STAGE[dragTargetStage as Exclude<CaseStageCategory, 'all'>];
        const newStageStr = STAGE_KEY_LABEL[newStageKey] || STAGE_DEFAULT_STRINGS[dragTargetStage] || '进度推进';
        savingRef.current = true;

        // 乐观更新：本地 + 全局 store（含 currentCase）
        setLocalCases((prev) =>
          prev.map((c) =>
            c.caseId === dragItem.caseId ? { ...c, stage: newStageStr } : c
          )
        );
        const { cases: globalCases, currentCase } = useCaseStore.getState();
        const updatedGlobal = globalCases.map((c) =>
          c.caseId === dragItem.caseId ? { ...c, stage: newStageStr } : c
        );
        const updatedCurrent =
          currentCase && currentCase.caseId === dragItem.caseId
            ? { ...currentCase, stage: newStageStr }
            : currentCase;
        useCaseStore.setState({ cases: updatedGlobal, currentCase: updatedCurrent });

        showToast('success', `案件 "${dragItem.clientName}" 已推进到 ${STAGE_NAMES[dragTargetStage]}`);

        if (import.meta.env.VITE_USE_MOCK === 'true') {
          savingRef.current = false; // 演示模式不调后端
        } else {
          updateCaseStage(dragItem.caseId, newStageKey)
            .then((res) => {
              useCaseStore.getState().bumpStageVersion();
              const { currentCase: cc } = useCaseStore.getState();
              if (cc && cc.caseId === dragItem.caseId) {
                useCaseStore.setState({ currentCase: { ...cc, stage: res.stage } });
              }
            })
            .catch((err) => {
              // 失败回滚：本地 + 全局 store 恢复原阶段
              setLocalCases((prev) =>
                prev.map((c) => (c.caseId === dragItem.caseId ? { ...c, stage: origStageStr } : c))
              );
              const { cases: gc, currentCase: cc2 } = useCaseStore.getState();
              useCaseStore.setState({
                cases: gc.map((c) => (c.caseId === dragItem.caseId ? { ...c, stage: origStageStr } : c)),
                currentCase:
                  cc2 && cc2.caseId === dragItem.caseId ? { ...cc2, stage: origStageStr } : cc2,
              });
              showToast('error', `阶段更新失败：${err?.message || '请重试'}`);
            })
            .finally(() => {
              savingRef.current = false;
            });
        }
      }
    } else if (!dragInfoRef.current.isMoved) {
      // It was a click!
      onCardClick(dragItem);
    }

    // Reset drag state
    dragInfoRef.current = { caseItem: null, startX: 0, startY: 0, isMoved: false };
    setDraggingCaseId(null);
    setDragTargetStage(null);
  };

  return (
    <div
      className="flex-1 overflow-x-auto no-scrollbar py-2"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      id="kanban-board-container"
    >
      <div className="flex space-x-4 min-w-max pb-4">
        {KANBAN_STAGES.map((stg) => {
          const stageCases = currentCases.filter(
            (c) => stageCategoryFromStage(c.stage) === stg
          );
          return (
            <KanbanColumn
              key={stg}
              stage={stg}
              cases={stageCases}
              isDropTarget={dragTargetStage === stg && draggingCaseId !== null}
              draggingCaseId={draggingCaseId}
              onCardClick={onCardClick}
              onCardDragStart={handlePointerDown}
              onCardDragEnd={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
