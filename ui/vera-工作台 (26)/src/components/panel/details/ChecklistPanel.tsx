import { motion } from 'motion/react';
import { ListChecks, Plus, ChevronDown } from 'lucide-react';
import { ChecklistItemType } from '../../../types';
import { ChecklistItem } from './ChecklistItem';

interface ChecklistPanelProps {
  items: ChecklistItemType[];
  onToggleItem: (id: string) => void;
  onAddItem: (label: string, category: "required" | "ai_suggested" | "optional") => void;
}

export function ChecklistPanel({ items, onToggleItem, onAddItem }: ChecklistPanelProps) {
  const requiredItems = items.filter((i) => i.category === 'required');
  const aiSuggestedItems = items.filter((i) => i.category === 'ai_suggested');
  const optionalItems = items.filter((i) => i.category === 'optional');

  const handleShowMoreOptions = () => {
    alert("📋 银行业务标准全集清单选项:\n1. 签证状态准入确认函 (VEVO)\n2. 负债还款流水明细 (3个月)\n3. 资产清算评估表\n4. 出租意向合同与评估\n\n点击确认可直接加入当前递交清单。");
  };

  const handleAddCustom = () => {
    const customName = prompt("请输入新增自定义清单项名称:", "自住房水电气账单 (Rates)");
    if (customName && customName.trim()) {
      onAddItem(customName.trim(), "optional");
    }
  };

  return (
    <div className="rounded-2xl p-5 border space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="checklist-panel-container">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <ListChecks className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            📋 递交清单 · CBA Full Doc 房贷
          </h4>
        </div>
        <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--text-muted)' }}>
          已选 {items.filter(i => i.checked).length} / {items.length} 项
        </span>
      </div>

      {/* Group 1: Required */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--green)' }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--green)' }} />
          <span>🟢 必选（银行要求）</span>
        </div>
        <div className="space-y-1.5">
          {requiredItems.map((item) => (
            <div key={item.id}>
              <ChecklistItem item={item} onToggle={onToggleItem} />
            </div>
          ))}
        </div>
      </div>

      {/* Group 2: AI Suggested */}
      <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--yellow)' }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--yellow)' }} />
          <span>🟡 AI 建议（可根据需要去勾）</span>
        </div>
        <div className="space-y-1.5">
          {aiSuggestedItems.map((item) => (
            <div key={item.id}>
              <ChecklistItem item={item} onToggle={onToggleItem} />
            </div>
          ))}
        </div>
      </div>

      {/* Group 3: Optional Items if any exist */}
      {optionalItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
            <span>⚪ 补充可选项</span>
          </div>
          <div className="space-y-1.5">
            {optionalItems.map((item) => (
              <div key={item.id}>
                <ChecklistItem item={item} onToggle={onToggleItem} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Item Action Buttons */}
      <div className="flex items-center space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleShowMoreOptions}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed flex items-center space-x-1.5 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <span>⬜ 更多可选（从全集添加）</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleAddCustom}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center space-x-1 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新增自定义项</span>
        </motion.button>
      </div>
    </div>
  );
}
