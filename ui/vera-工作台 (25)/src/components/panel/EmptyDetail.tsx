import { MousePointerClick } from 'lucide-react';

export function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none" id="empty-detail-view">
      <div 
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-xs border"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        <MousePointerClick className="w-7 h-7 stroke-[1.5]" style={{ color: 'var(--accent)' }} />
      </div>

      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        选择一个任务卡查看详情
      </h3>

      <p className="text-xs max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
        请从左侧任务列表中选择一条卡片，系统将为您自动装载该案件上下文、银行邮件内容与 Vera AI 草稿。
      </p>
    </div>
  );
}
