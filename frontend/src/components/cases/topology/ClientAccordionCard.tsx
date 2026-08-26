import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  CheckSquare,
  Square,
  MinusSquare,
  Users,
  Handshake,
  Layers,
  FileCheck,
  UserCheck,
} from 'lucide-react';
import { ClientTopologyMeta } from '../../../types/api';
import { CaseSubfolderCard } from './CaseSubfolderCard';

interface ClientAccordionCardProps {
  client: ClientTopologyMeta;
  isExpanded: boolean;
  selectedPaths: Set<string>;
  onToggleExpand: () => void;
  onToggleCase: (path: string) => void;
  onToggleClientAll: (client: ClientTopologyMeta) => void;
}

export function ClientAccordionCard({
  client,
  isExpanded,
  selectedPaths,
  onToggleExpand,
  onToggleCase,
  onToggleClientAll,
}: ClientAccordionCardProps) {
  const reduced = useReducedMotion();

  const casePaths = client.cases.map((c) => c.folder_path);
  const selectedCount = casePaths.filter((p) => selectedPaths.has(p)).length;
  const isAllSelected = casePaths.length > 0 && selectedCount === casePaths.length;
  const isPartialSelected = selectedCount > 0 && selectedCount < casePaths.length;

  const recActiveCount = client.cases.filter((c) => c.is_recommended_active).length;

  const getCategoryBadge = () => {
    switch (client.client_category) {
      case 'multi_case':
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1"
            style={{
              backgroundColor: 'var(--purple-soft)',
              borderColor: 'rgba(168, 85, 247, 0.3)',
              color: 'var(--purple)',
            }}
          >
            <Layers className="w-2.5 h-2.5" />
            <span>👔 多案卷客户</span>
          </span>
        );
      case 'single_case':
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1"
            style={{
              backgroundColor: 'var(--accent-soft)',
              borderColor: 'rgba(14, 165, 233, 0.3)',
              color: 'var(--accent)',
            }}
          >
            <FileCheck className="w-2.5 h-2.5" />
            <span>📄 标准单案卷</span>
          </span>
        );
      case 'lead':
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1"
            style={{
              backgroundColor: 'var(--yellow-soft)',
              borderColor: 'rgba(217, 119, 6, 0.3)',
              color: 'var(--yellow)',
            }}
          >
            <UserCheck className="w-2.5 h-2.5" />
            <span>💡 咨询潜客</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="rounded-2xl border transition-all overflow-hidden shadow-2xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: isAllSelected
          ? 'rgba(168, 85, 247, 0.4)'
          : isPartialSelected
          ? 'var(--border)'
          : 'var(--border)',
      }}
      id={`client-accordion-${client.client_name.replace(/[^a-zA-Z0-9]/g, '-')}`}
    >
      {/* 客户卡片头部 (点击可展开/收起) */}
      <div
        className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-b transition-colors cursor-pointer select-none"
        style={{
          backgroundColor: isExpanded ? 'var(--bg-panel)' : 'var(--bg-card)',
          borderColor: isExpanded ? 'var(--border)' : 'transparent',
        }}
        onClick={onToggleExpand}
      >
        {/* 左侧：复选框 + 头像 + 客户姓名 + 类别 + 渠道 + 联名 */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* 客户级 Checkbox (阻止冒泡，点击切换全部案卷) */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleClientAll(client);
            }}
            className="p-1 rounded-lg hover:bg-[var(--bg-input)] transition-colors cursor-pointer shrink-0"
            title={isAllSelected ? '取消全选该客户' : '全选该客户名下所有案卷'}
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            ) : isPartialSelected ? (
              <MinusSquare className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            ) : (
              <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            )}
          </div>

          {/* 客户头像简写 */}
          <div
            className="w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs"
            style={{
              backgroundColor: 'var(--purple-soft)',
              color: 'var(--purple)',
            }}
          >
            {client.client_name.slice(0, 2).toUpperCase()}
          </div>

          {/* 客户主体与标签 */}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                {client.client_name}
              </span>
              {getCategoryBadge()}

              {/* 所属 Broker */}
              {client.broker_name && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center space-x-1"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    borderColor: 'rgba(14, 165, 233, 0.3)',
                    color: 'var(--accent)',
                  }}
                  title={`所属 Broker：${client.broker_name}`}
                >
                  <span>Broker: {client.broker_name}</span>
                </span>
              )}

              {/* 推荐人渠道 */}
              {client.referrer_name && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center space-x-1"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title={`推荐渠道：${client.referrer_name}`}
                >
                  <Handshake className="w-2.5 h-2.5" style={{ color: 'var(--accent)' }} />
                  <span>渠道: {client.referrer_name}</span>
                </span>
              )}

              {/* 联名借款人 */}
              {client.co_borrowers && client.co_borrowers.length > 0 && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center space-x-1"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title={`联名借款人: ${client.co_borrowers.join(', ')}`}
                >
                  <Users className="w-2.5 h-2.5" style={{ color: 'var(--purple)' }} />
                  <span>联名: {client.co_borrowers.join(' & ')}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：案卷概览徽标 + 展开箭头 */}
        <div className="flex items-center space-x-2 shrink-0">
          <div
            className="px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center space-x-1.5"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>共 {client.cases.length} 个案卷</span>
            {recActiveCount > 0 && (
              <span className="font-bold" style={{ color: 'var(--purple)' }}>
                · {recActiveCount} 个活跃推荐
              </span>
            )}
          </div>

          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="p-1 rounded-lg text-[var(--text-muted)]"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
      </div>

      {/* 展开的案卷子列表 (Accordion Body) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="p-3.5 space-y-2.5 border-t"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
            }}
          >
            {client.cases.map((c) => (
              <CaseSubfolderCard
                key={c.folder_path}
                caseItem={c}
                isSelected={selectedPaths.has(c.folder_path)}
                onToggle={onToggleCase}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
