import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useChecklistStore } from '../../stores/checklistStore';
import { useCaseStore } from '../../stores/caseStore';
import { ChecklistPanel } from './details/ChecklistPanel';

interface ChecklistDrawerContentProps {
  caseId: string;
}

export function ChecklistDrawerContent({ caseId }: ChecklistDrawerContentProps) {
  const { items, loading, error, fetchChecklist, toggleItem, revokeFileMatch, reset } = useChecklistStore();
  const cases = useCaseStore((s) => s.cases);
  const currentCase = useCaseStore((s) => s.currentCase);
  const targetCase = cases.find((c) => c.caseId === caseId) || (currentCase?.caseId === caseId ? currentCase : null);

  useEffect(() => {
    fetchChecklist(caseId);
    return () => {
      reset();
    };
  }, [caseId, fetchChecklist, reset]);

  const handleToggleItem = (id: string) => {
    const target = items.find((i) => i.id === id);
    if (target) {
      toggleItem(id, !target.checked);
    }
  };

  const handleAddItem = (label: string, category: 'required' | 'ai_suggested' | 'optional') => {
    useChecklistStore.setState((state) => ({
      items: [
        ...state.items,
        { id: `custom-${Date.now()}`, label, category, checked: false },
      ],
    }));
  };

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3" id="checklist-drawer-loading">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 rounded-xl border animate-pulse p-3"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-[var(--red-soft)] bg-[var(--red-soft)] text-[var(--red)] space-y-3" id="checklist-drawer-error">
        <div className="flex items-center space-x-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => fetchChecklist(caseId)}
          className="px-3 py-1.5 rounded-lg bg-[var(--red-soft)] hover:bg-[var(--red)]/30 text-xs font-medium flex items-center space-x-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>重试</span>
        </button>
      </div>
    );
  }

  return (
    <div id="checklist-drawer-content">
      <ChecklistPanel
        items={items}
        caseId={caseId}
        lender={targetCase?.lender}
        onToggleItem={handleToggleItem}
        onRevokeItem={(itemId, fileId) => revokeFileMatch(caseId, fileId || 'file-default', itemId)}
        onAddItem={handleAddItem}
      />
    </div>
  );
}
