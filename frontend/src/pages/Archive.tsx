import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Archive as ArchiveIcon,
  HardDriveDownload,
  RefreshCw,
  AlertCircle,
  Users,
  DollarSign,
  Zap,
  BookOpen,
  Radar,
  Building2,
} from 'lucide-react';
import { getArchiveStats, syncKnowledgePrecedents } from '../services/api/cases';
import { useToastStore } from '../stores/toastStore';
import { ArchiveBatchImportModal } from '../components/archive/ArchiveBatchImportModal';
import { ClientPortfoliosView } from '../components/archive/ClientPortfoliosView';
import { RetentionRadar } from '../components/archive/RetentionRadar';
import { PrecedentsAssessorHub } from '../components/archive/PrecedentsAssessorHub';
import { ArchiveHubStats } from '../types/api';

export function Archive() {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'portfolio' | 'radar' | 'precedents'>('portfolio');
  const [stats, setStats] = useState<ArchiveHubStats>({
    total_archived_clients: 18,
    total_cases_count: 24,
    total_loan_volume: 18600000,
    total_opportunities_count: 6,
    total_precedents_count: 12,
  });
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);

  const handleSyncKnowledge = async () => {
    setIsSyncing(true);
    try {
      const res = await syncKnowledgePrecedents();
      showToast('success', res.message || `已成功同步 ${res.synced_count} 条实战先例至全局知识库！`);
      fetchStats();
    } catch (err: any) {
      showToast('error', `刷新先例失败: ${err?.message || '网络问题'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getArchiveStats();
      if (res.ok) {
        setStats(res.stats);
      }
    } catch (err: any) {
      console.error('Fetch archive stats error:', err);
      setError(err?.message || '获取档案大盘数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleImportSuccess = () => {
    fetchStats();
  };

  return (
    <div
      className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto no-scrollbar max-w-6xl mx-auto w-full"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="archive-hub-page"
    >
      {/* 1. 顶部：管理资产大盘与操作栏 (Header & Stats) */}
      <div className="space-y-4">
        {/* 顶部标题行 */}
        <div
          className="flex items-center justify-between pb-3 border-b flex-wrap gap-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--on-accent)',
              }}
            >
              <ArchiveIcon className="w-5 h-5" />
            </div>
            <div>
              <h1
                className="text-lg font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                档案与客户终生价值中心 (Archive Hub)
              </h1>
              <p className="text-xs text-muted">
                管理资产大盘 · 客户终生资产池 · 二次经营商机雷达 · AI 先例智库 (WO-60)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 维护性刷新先例小按钮 (WO-61) */}
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={handleSyncKnowledge}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all hover:bg-[var(--purple-soft)] hover:border-[var(--purple)] disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--purple)',
              }}
              id="sync-knowledge-precedents-btn"
              title="手动触发智库先例一键刷新与提炼"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>刷新智库先例</span>
            </motion.button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={() => setIsBatchImportOpen(true)}
              className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all hover:opacity-90"
              style={{
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: 'var(--on-accent)',
              }}
              id="archive-batch-import-open-btn"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>批量归档历史客户案卷</span>
            </motion.button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={fetchStats}
              disabled={loading}
              className="p-2 rounded-xl border text-xs font-semibold flex items-center justify-center cursor-pointer hover:opacity-80 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              title="刷新大盘"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </motion.button>
          </div>
        </div>

        {/* 顶部 4 大资产指标卡片 (Dashboard Stats) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" id="archive-stats-grid">
          {/* 👥 管理客户总数 */}
          <div
            className="p-4 rounded-2xl border space-y-1 transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold">管理客户总数</span>
              <div className="p-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <span
                className="text-xl sm:text-2xl font-extrabold font-mono"
                style={{ color: 'var(--text-primary)' }}
              >
                {stats.total_archived_clients}
              </span>
              <span className="text-xs font-medium text-muted">位客户 ({stats.total_cases_count} 宗案卷)</span>
            </div>
          </div>

          {/* 💰 贷款总资产规模 */}
          <div
            className="p-4 rounded-2xl border space-y-1 transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold">贷款资产总规模</span>
              <div className="p-1.5 rounded-xl bg-[var(--green-soft)] text-[var(--green)]">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <span
                className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--green)]"
              >
                $
                {stats.total_loan_volume >= 1000000
                  ? `${(stats.total_loan_volume / 1000000).toFixed(1)}M`
                  : stats.total_loan_volume.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-muted">AUD</span>
            </div>
          </div>

          {/* ⚡ 二次经营商机数 */}
          <div
            onClick={() => setActiveTab('radar')}
            className="p-4 rounded-2xl border space-y-1 transition-all cursor-pointer hover:border-[var(--red, #ef4444)]"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold">二次经营商机</span>
              <div className="p-1.5 rounded-xl bg-[var(--red-soft, rgba(239,68,68,0.15))] text-[var(--red, #ef4444)]">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <span
                className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--red, #ef4444)]"
              >
                {stats.total_opportunities_count}
              </span>
              <span className="text-xs font-medium text-muted">宗待跟进机会</span>
            </div>
          </div>

          {/* 🧠 收录实战先例 */}
          <div
            onClick={() => setActiveTab('precedents')}
            className="p-4 rounded-2xl border space-y-1 transition-all cursor-pointer hover:border-[var(--purple, #a855f7)]"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold">实战先例智库</span>
              <div className="p-1.5 rounded-xl bg-[var(--purple-soft, rgba(168,85,247,0.15))] text-[var(--purple, #a855f7)]">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <span
                className="text-xl sm:text-2xl font-extrabold font-mono text-[var(--purple, #a855f7)]"
              >
                {stats.total_precedents_count}
              </span>
              <span className="text-xs font-medium text-muted">宗破局复盘</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 三大核心 Tab 切换栏 (Segmented Control) */}
      <div
        className="inline-flex items-center p-1 rounded-2xl border gap-1 flex-wrap"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
        id="archive-tab-switch"
      >
        {/* Tab 1: 客户终生资产池 */}
        <button
          type="button"
          onClick={() => setActiveTab('portfolio')}
          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
            activeTab === 'portfolio'
              ? 'text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          id="archive-tab-portfolio-btn"
        >
          {activeTab === 'portfolio' && (
            <motion.div
              layoutId="archive-active-tab-indicator"
              className="absolute inset-0 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            />
          )}
          <Building2 className="w-4 h-4 z-10 text-[var(--accent)]" />
          <span className="z-10">客户终生资产池 (Portfolios)</span>
          <span className="z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono text-muted bg-[var(--bg-subtle)]">
            {stats.total_archived_clients}
          </span>
        </button>

        {/* Tab 2: 二次经营商机雷达 */}
        <button
          type="button"
          onClick={() => setActiveTab('radar')}
          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
            activeTab === 'radar'
              ? 'text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          id="archive-tab-radar-btn"
        >
          {activeTab === 'radar' && (
            <motion.div
              layoutId="archive-active-tab-indicator"
              className="absolute inset-0 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            />
          )}
          <Radar className="w-4 h-4 z-10 text-[var(--accent)]" />
          <span className="z-10">二次经营商机雷达 (Retention Radar)</span>
          <span
            className="z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
            style={{
              backgroundColor: 'var(--red-soft, rgba(239, 68, 68, 0.15))',
              color: 'var(--red, #ef4444)',
            }}
          >
            {stats.total_opportunities_count}
          </span>
        </button>

        {/* Tab 3: AI 先例智库与审批官画像 */}
        <button
          type="button"
          onClick={() => setActiveTab('precedents')}
          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
            activeTab === 'precedents'
              ? 'text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          id="archive-tab-precedents-btn"
        >
          {activeTab === 'precedents' && (
            <motion.div
              layoutId="archive-active-tab-indicator"
              className="absolute inset-0 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            />
          )}
          <BookOpen className="w-4 h-4 z-10 text-[var(--purple, #a855f7)]" />
          <span className="z-10">AI 先例智库与审批官 (Precedents)</span>
          <span
            className="z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
            style={{
              backgroundColor: 'var(--purple-soft, rgba(168, 85, 247, 0.15))',
              color: 'var(--purple, #a855f7)',
            }}
          >
            WO-59
          </span>
        </button>
      </div>

      {/* 错误提示条 */}
      {error && (
        <div className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchStats} className="underline font-bold cursor-pointer">
            重试
          </button>
        </div>
      )}

      {/* 3. Tab 内容展示区 */}
      {/* TAB 1: 客户终生资产池 */}
      {activeTab === 'portfolio' && <ClientPortfoliosView />}

      {/* TAB 2: 二次经营商机雷达 */}
      {activeTab === 'radar' && <RetentionRadar />}

      {/* TAB 3: AI 先例智库与审批官画像 */}
      {activeTab === 'precedents' && <PrecedentsAssessorHub />}

      {/* 4. 批量归档历史客户案卷模态窗 (WO-57) */}
      <ArchiveBatchImportModal
        open={isBatchImportOpen}
        onClose={() => setIsBatchImportOpen(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
