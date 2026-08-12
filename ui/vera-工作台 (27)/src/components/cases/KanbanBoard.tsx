import { useState, useRef } from 'react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { CaseStageCategory, stageCategoryFromStage } from '../../services/caseMapper';
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
      if (dragTargetStage !== origStage) {
        // Move case to new stage
        const newStageStr = STAGE_DEFAULT_STRINGS[dragTargetStage] || '进度推进';
        setLocalCases((prev) =>
          prev.map((c) =>
            c.caseId === dragItem.caseId ? { ...c, stage: newStageStr } : c
          )
        );

        // Update global store if possible
        const { cases: globalCases } = useCaseStore.getState();
        const updatedGlobal = globalCases.map((c) =>
          c.caseId === dragItem.caseId ? { ...c, stage: newStageStr } : c
        );
        useCaseStore.setState({ cases: updatedGlobal });

        showToast('success', `案件 "${dragItem.clientName}" 已推进到 ${STAGE_NAMES[dragTargetStage]}（演示）`);
        // TODO(WO-03): POST /api/cases/{id}/stage-advance
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
      <p className="text-[11px] font-mono text-muted text-right">
        TODO(WO-03): POST /api/cases/&#123;id&#125;/stage-advance
      </p>
    </div>
  );
}
