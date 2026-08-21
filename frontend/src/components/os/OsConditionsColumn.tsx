import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Landmark, FileCheck, CheckCircle, Circle, Plus } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export interface OsConditionItem {
  id: string;
  conditionName: string;
  evidenceName?: string;
  available?: boolean;
  cleared: boolean;
}

interface OsConditionsColumnProps {
  initialConditions?: OsConditionItem[];
}

export function OsConditionsColumn({ initialConditions }: OsConditionsColumnProps) {
  const reduced = useReducedMotion();
  const [conditions, setConditions] = useState<OsConditionItem[]>(initialConditions || []);
  const [newCondText, setNewCondText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const toggleCleared = (id: string) => {
    setConditions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextState = !item.cleared;
          showToast('success', `条件 "${item.conditionName.slice(0, 15)}..." 标记为${nextState ? '已清除' : '未清除'}`);
          return { ...item, cleared: nextState };
        }
        return item;
      })
    );
  };

  const handleAddCondition = () => {
    if (!newCondText.trim()) return;
    const newItem: OsConditionItem = {
      id: `cond-${Date.now()}`,
      conditionName: newCondText.trim(),
      evidenceName: '待关联材料',
      available: false,
      cleared: false,
    };
    setConditions([...conditions, newItem]);
    setNewCondText('');
    setIsAdding(false);
    showToast('success', '已添加新补件条件');
  };

  const clearedCount = conditions.filter((c) => c.cleared).length;

  return (
    <div className="w-full xl:w-[300px] flex-shrink-0 flex flex-col space-y-4" id="os-conditions-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <Landmark className="w-4 h-4 text-[var(--yellow)]" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            OS 条件与证据映射
          </h3>
        </div>
        {conditions.length > 0 && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--yellow-soft)] text-[var(--yellow)]">
            已清除 {clearedCount}/{conditions.length}
          </span>
        )}
      </div>

      <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
        {conditions.length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-center p-4 rounded-2xl border space-y-3 bg-[var(--bg-card)] border-dashed border-[var(--border)]">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[var(--green)]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--text-primary)]">🎉 暂无未决 OS 补件条件</p>
              <p className="text-[11px] text-muted">当前案卷尚未登记银行硬性条件，或所有条件已全部清除</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 cursor-pointer flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加补件条件</span>
            </button>
          </div>
        ) : (
          conditions.map((cond) => (
            <motion.div
              key={cond.id}
              whileHover={reduced ? undefined : { y: -1 }}
              className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs shadow-2xs transition-all cursor-pointer ${
                cond.cleared ? 'opacity-70 bg-[var(--accent-soft)]/20' : 'bg-[var(--bg-card)]'
              }`}
              style={{ borderColor: 'var(--border)' }}
              onClick={() => toggleCleared(cond.id)}
              id={`os-condition-${cond.id}`}
            >
              <button className="mt-0.5 flex-shrink-0 cursor-pointer">
                {cond.cleared ? (
                  <CheckCircle className="w-4 h-4 text-[var(--green)] fill-[var(--green-soft)]" />
                ) : (
                  <Circle className="w-4 h-4 text-muted hover:text-primary" />
                )}
              </button>

              <div className="flex-1 min-w-0 space-y-1">
                <span className={`font-semibold block leading-snug ${cond.cleared ? 'line-through text-muted' : 'text-[var(--text-primary)]'}`}>
                  {cond.conditionName}
                </span>

                {cond.evidenceName && (
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="flex items-center space-x-1 font-medium text-muted">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>{cond.evidenceName}</span>
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}

        {/* Add condition form */}
        {isAdding && (
          <div className="p-3 rounded-xl border bg-[var(--bg-card)] space-y-2 border-[var(--accent)]">
            <input
              type="text"
              value={newCondText}
              onChange={(e) => setNewCondText(e.target.value)}
              placeholder="输入银行 OS 条件描述..."
              className="w-full text-xs p-2 rounded-lg border bg-[var(--bg-app)] border-[var(--border)] outline-none"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddCondition()}
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2 py-1 text-xs text-muted hover:underline"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddCondition}
                className="px-2.5 py-1 text-xs font-bold text-white bg-[var(--accent)] rounded-lg"
              >
                添加
              </button>
            </div>
          </div>
        )}
      </div>

      {conditions.length > 0 && !isAdding && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full py-2 border border-dashed rounded-xl text-xs text-muted hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors flex items-center justify-center space-x-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加其他条件</span>
        </button>
      )}
    </div>
  );
}
