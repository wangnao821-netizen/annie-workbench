import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Sparkles, Plus, Mail, BarChart2, AlertTriangle, 
  Calendar, CheckCircle2, ArrowRight, ArrowUpRight,
  RefreshCw, User, Briefcase, FileText, X, MessageSquare,
  Lightbulb, Layers, ChevronDown, Filter, Crown, Bot
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useTaskStore } from '../../stores/taskStore';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { getOverview } from '../../services/api/analytics';
import { AnalyticsOverview } from '../../types/api';
import { TaskItem, TaskPriority } from '../../types';

interface HomePageProps {
  onNavigate: (v: ViewId) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const reduced = useReducedMotion();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const [taskTab, setTaskTab] = useState<'all' | 'overdue' | 'boss' | 'ai'>('all');
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null);

  const { tasks, loading: tasksLoading, error: tasksError, fetchTasks } = useTaskStore();
  const { cases, setCurrentCase, fetchCases } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const setPendingChatPrompt = useUiStore((s) => s.setPendingChatPrompt);

  useEffect(() => {
    fetchTasks();
    fetchCases();
    
    // Fetch overview statistics
    getOverview('week')
      .then((data) => setAnalyticsOverview(data))
      .catch(() => setAnalyticsOverview(null));
  }, [fetchTasks, fetchCases]);

  // Compute date string
  const todayDateStr = useMemo(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return now.toLocaleDateString('zh-CN', options);
  }, []);

  // Calculate overdue tasks & due today
  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && (
      t.priority === 'urgent' || 
      t.tags.some(tag => tag.label.includes('超期') || tag.label.includes('逾期') || tag.label.includes('紧急')) ||
      (t.deadline && new Date(t.deadline).getTime() < Date.now())
    ));
  }, [tasks]);

  // Boss tasks requiring decision
  const bossTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && t.escalatedToBoss === true);
  }, [tasks]);

  // AI suggested tasks
  const aiSuggestedTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && (
      Boolean(t.aiSummary) || 
      t.type === 'OS_ATTACK' || 
      t.type === 'FILE_MATCH' ||
      t.tags.some(tag => tag.label.includes('AI') || tag.label.includes('建议') || tag.label.includes('匹配'))
    ));
  }, [tasks]);

  // Sorted and filtered tasks for left Bento column
  const sortedTasks = useMemo(() => {
    let list = tasks.filter((t) => !t.completed);
    if (taskTab === 'overdue') {
      list = list.filter((t) => t.priority === 'urgent' || t.tags.some(tag => tag.label.includes('超期') || tag.label.includes('逾期')));
    } else if (taskTab === 'boss') {
      list = list.filter((t) => t.escalatedToBoss === true);
    } else if (taskTab === 'ai') {
      list = list.filter((t) => Boolean(t.aiSummary) || t.type === 'OS_ATTACK' || t.type === 'FILE_MATCH');
    }

    // Sort: Overdue -> Priority -> Deadline (completed sink)
    return list.sort((a, b) => {
      const aOverdue = a.priority === 'urgent' || a.tags.some(t => t.label.includes('超期') || t.label.includes('逾期'));
      const bOverdue = b.priority === 'urgent' || b.tags.some(t => t.label.includes('超期') || t.label.includes('逾期'));
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      const priorityWeight: Record<TaskPriority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;

      const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [tasks, taskTab]);

  // Kanban Stage Breakdown from cases
  const stageBreakdown = useMemo(() => {
    const counts = {
      collecting: 0, // 资料收集
      submitted: 0,  // 银行递交
      approved: 0,   // 预批批复
      settling: 0,   // 待结算
    };

    cases.forEach((c) => {
      const st = c.stage || '';
      if (st.includes('意向') || st.includes('收集') || st.includes('文档') || st.includes('准备')) {
        counts.collecting++;
      } else if (st.includes('递交') || st.includes('审贷') || st.includes('评估')) {
        counts.submitted++;
      } else if (st.includes('批复') || st.includes('预批') || st.includes('通过')) {
        counts.approved++;
      } else {
        counts.settling++;
      }
    });

    const total = Math.max(cases.length, 1);
    return [
      { label: '资料收集', count: counts.collecting, pct: Math.round((counts.collecting / total) * 100), color: 'bg-[var(--accent)]' },
      { label: '银行递交', count: counts.submitted, pct: Math.round((counts.submitted / total) * 100), color: 'bg-[var(--yellow)]' },
      { label: '预批批复', count: counts.approved, pct: Math.round((counts.approved / total) * 100), color: 'bg-[var(--green)]' },
      { label: '待结算', count: counts.settling, pct: Math.round((counts.settling / total) * 100), color: 'bg-[var(--purple)]' },
    ];
  }, [cases]);

  const handleStartChat = (text?: string) => {
    const promptToSend = text || chatPrompt;
    if (!promptToSend.trim()) return;
    setPendingChatPrompt(promptToSend.trim());
    setCurrentCase(null);
    onNavigate('brain');
  };

  const handleOpenCaseTask = (task: TaskItem) => {
    let matchedCase = null;
    if (task.caseId) {
      matchedCase = cases.find((c) => c.caseId === task.caseId);
    }
    if (!matchedCase && task.caseName) {
      const cleanName = task.caseName.replace(/\(.*?\)/g, '').trim();
      matchedCase = cases.find((c) => c.clientName.includes(cleanName) || cleanName.includes(c.clientName.slice(0, 2)));
    }

    if (matchedCase) {
      setCurrentCase(matchedCase);
      onNavigate('brain');
    } else {
      useUiStore.getState().openTaskDetail(task.id);
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red-soft)]">🔥 紧急</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">⚡ 优先</span>;
      case 'normal':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--accent-soft)] text-[var(--accent)]">常规</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-xs text-muted bg-[var(--bg-subtle)]">低级</span>;
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto no-scrollbar p-4 md:p-6 space-y-6 select-none" style={{ backgroundColor: 'var(--bg-app)' }} id="home-page-container">
      
      {/* 1. 到期 / 逾期提醒条 (Top Alert Banner) */}
      <AnimatePresence>
        {!bannerDismissed && overdueTasks.length > 0 && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="p-3.5 rounded-2xl border flex items-center justify-between text-xs font-semibold shadow-md border-[var(--yellow-soft)] text-[var(--yellow)] bg-[var(--yellow-soft)]"
            id="overdue-banner"
          >
            <div className="flex items-center space-x-3">
              <div className="p-1.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0 relative overflow-visible">
                <AlertTriangle className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 pointer-events-none">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--red)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--red)] shadow-xs" />
                </span>
              </div>
              <div className="truncate">
                <span className="font-extrabold text-[var(--yellow)] mr-2">到期/逾期预警：</span>
                <span className="text-secondary">当前有 <strong className="text-[var(--red)] font-extrabold">{overdueTasks.length} 项紧急待办</strong> 超期或今日到期（如 NAB / CBA 补件要求），请优先跟进！</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setTaskTab('overdue')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)] transition-colors cursor-pointer"
              >
                查看逾期待办 ➔
              </motion.button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-muted hover:text-primary cursor-pointer transition-colors"
                id="close-overdue-banner-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. 日期放大为主标题 + 快捷操作行 (Welcome & Quick Actions Row) */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary flex items-center space-x-2">
              <Calendar className="w-6 h-6 text-[var(--accent)] inline-block flex-shrink-0" />
              <span>{todayDateStr}</span>
            </h1>
            <p className="text-xs text-muted">
              今天有 <strong className="text-[var(--red)] font-bold">{overdueTasks.length} 个紧急待办</strong> · 2 个到期预警 · 1 个银行审贷回复待处理
            </p>
          </div>

          {/* 3. 快捷操作按钮 (3 Actions) */}
          <div className="flex items-center space-x-2 pt-2 md:pt-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setNewCaseOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold shadow-md flex items-center space-x-1.5 cursor-pointer hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
              id="quick-new-case-btn"
            >
              <Plus className="w-4 h-4" />
              <span>新建案件</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-email-co-create'));
                onNavigate('brain');
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="quick-compose-mail-btn"
            >
              <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>写邮件</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate('analytics')}
              className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="quick-analytics-btn"
            >
              <BarChart2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>统计视图</span>
            </motion.button>
          </div>
        </div>

        {/* 4. Bento 统计数字卡片 (4 Stat Cards with Hover Lift) */}
        {(() => {
          const current = analyticsOverview?.current;
          const previous = analyticsOverview?.previous;
          const pct = (cur: number, prev: number) =>
            prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null; // null → 渲染 "—"

          const renderPct = (p: number | null) => {
            if (p === null) return <span className="text-xs font-bold text-muted">—</span>;
            return (
              <span className={`text-xs font-bold ${p >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                {p >= 0 ? `+${p}%` : `${p}%`}
              </span>
            );
          };

          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {/* Active Cases */}
              <motion.div
                whileHover={reduced ? undefined : { y: -2 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-muted text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-[11px]">活跃案件</span>
                  <div className="p-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Briefcase className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight text-primary">
                    {current?.active_cases ?? cases.length}
                  </span>
                  {renderPct(pct(current?.active_cases ?? 0, previous?.active_cases ?? 0))}
                </div>
                <p className="text-[11px] text-muted truncate">进行中与审贷中案件</p>
              </motion.div>

              {/* New Cases */}
              <motion.div
                whileHover={reduced ? undefined : { y: -2 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-muted text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-[11px]">本月新增</span>
                  <div className="p-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight text-primary">
                    {current?.new_cases ?? 0}
                  </span>
                  {renderPct(pct(current?.new_cases ?? 0, previous?.new_cases ?? 0))}
                </div>
                <p className="text-[11px] text-muted truncate">新进入意向/预审客户</p>
              </motion.div>

              {/* Submitted Cases */}
              <motion.div
                whileHover={reduced ? undefined : { y: -2 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-muted text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-[11px]">已递交</span>
                  <div className="p-1.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)]">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight text-primary">
                    {current?.submitted ?? 0}
                  </span>
                  {renderPct(pct(current?.submitted ?? 0, previous?.submitted ?? 0))}
                </div>
                <p className="text-[11px] text-muted truncate">银行审贷评估中</p>
              </motion.div>

              {/* Expected Commission */}
              <motion.div
                whileHover={reduced ? undefined : { y: -2 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between text-muted text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-[11px]">预估佣金 (AUD)</span>
                  <div className="p-1.5 rounded-xl bg-[var(--green-soft)] text-[var(--green)] font-extrabold text-xs">
                    $
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight text-[var(--green)]">
                    ${(current?.commission_estimate ?? 0).toLocaleString()}
                  </span>
                  {renderPct(pct(current?.commission_estimate ?? 0, previous?.commission_estimate ?? 0))}
                </div>
                <p className="text-[11px] text-muted truncate">预计放款结算佣金</p>
              </motion.div>
            </div>
          );
        })()}
      </div>

      {/* 5. 主内容区 (Bento 双栏 Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column (span-2): 今日待办 */}
        <div className="lg:col-span-2 rounded-2xl border p-4 shadow-sm flex flex-col h-full min-h-[380px]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {/* Section Header & Dropdown Filter */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
              <h2 className="text-sm font-extrabold tracking-tight text-primary">
                今日待办 (Today's Priorities)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                {sortedTasks.length} 项
              </span>
            </div>

            {/* 下拉菜单形式 (Task Category Dropdown) */}
            <div className="flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-muted hidden sm:inline" />
              <div className="relative">
                <select
                  value={taskTab}
                  onChange={(e) => setTaskTab(e.target.value as 'all' | 'overdue' | 'boss' | 'ai')}
                  className="appearance-none border rounded-xl px-3 py-1 pr-7 text-xs font-bold outline-none cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  id="home-task-tab-select"
                >
                  <option value="all" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}>全部待办 ({tasks.filter(t => !t.completed).length})</option>
                  <option value="overdue" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--red)' }}>逾期/紧急 ({overdueTasks.length})</option>
                  <option value="boss" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--yellow)' }}>待老板拍板 ({bossTasks.length})</option>
                  <option value="ai" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--purple)' }}>AI 建议 ({aiSuggestedTasks.length})</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Task Items list with fixed scrollable height matching right column */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 pt-1 pr-0.5">
            {tasksLoading ? (
              <div className="py-12 text-center text-xs text-muted space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[var(--accent)]" />
                <p>正在获取最新待办清单...</p>
              </div>
            ) : tasksError ? (
              <div className="p-4 rounded-xl bg-[var(--red-soft)] border border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
                <span>{tasksError}</span>
                <button onClick={() => fetchTasks()} className="px-2.5 py-1 rounded-lg bg-[var(--red)] text-white font-bold cursor-pointer">
                  重试
                </button>
              </div>
            ) : sortedTasks.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-[var(--green-soft)] text-[var(--green)] flex items-center justify-center mx-auto border border-[var(--green-soft)] shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="font-extrabold text-xs text-primary">当前分类无待办事项</h3>
                  <p className="text-[11px] text-muted max-w-sm mx-auto">
                    相关补件与沟通任务均已按时完成。
                  </p>
                </div>
              </div>
            ) : (
              sortedTasks.map((t) => {
                const isUrgent = t.priority === 'urgent' || t.tags.some(tag => tag.label.includes('超期') || tag.label.includes('逾期'));
                const isAi = Boolean(t.aiSummary) || t.type === 'OS_ATTACK';

                return (
                  <motion.div
                    key={t.id}
                    whileHover={{ y: -1 }}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                      isUrgent ? 'bg-[var(--red-soft)] border-[var(--red-soft)]' : 'bg-[var(--bg-card)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                    id={`home-task-item-${t.id}`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                        {/* Boss Escalated / Overdue / AI / Normal Badge */}
                        {((t.status === 'in_progress' && (t.assignee === 'vera' || t.delegatedTo === 'vera')) || (t.assignee === 'vera' && !t.completed)) && (
                          <span className="px-1.5 py-0.2 rounded text-[11px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] inline-flex items-center space-x-1">
                            <span>🙋 Vera 正在跟进</span>
                          </span>
                        )}
                        {t.escalatedToBoss ? (
                          <span className="px-1.5 py-0.2 rounded text-[11px] font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)] inline-flex items-center space-x-1">
                            <Crown className="w-3 h-3" />
                            <span>待老板拍板</span>
                          </span>
                        ) : isUrgent ? (
                          <span className="px-1.5 py-0.2 rounded text-[11px] font-black bg-[var(--red)] text-white shadow-2xs">
                            已逾期
                          </span>
                        ) : isAi ? (
                          <span className="px-1.5 py-0.2 rounded text-[11px] font-bold bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)] inline-flex items-center space-x-1">
                            <Bot className="w-3 h-3" />
                            <span>AI 建议</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[11px] font-medium bg-[var(--bg-subtle)] text-muted">
                            常规
                          </span>
                        )}

                        {/* Priority Badge */}
                        {getPriorityBadge(t.priority)}

                        {/* Client Name */}
                        {t.caseName && (
                          <span className="font-extrabold text-[11px] text-primary flex items-center">
                            <User className="w-3 h-3 mr-0.5 text-muted inline" />
                            {t.caseName}
                          </span>
                        )}

                        {/* Lender */}
                        {t.caseBank && (
                          <span className="px-1 py-0.2 rounded text-[11px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]">
                            {t.caseBank}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-xs text-primary leading-tight truncate">
                        {t.title}
                      </h3>

                      {t.bossDecision && (
                        <p className="text-xs font-semibold text-[var(--yellow)] truncate">
                          问题: {t.bossDecision}
                        </p>
                      )}

                      {t.aiSummary && (
                        <p className="text-[11px] text-muted truncate">
                          {t.aiSummary}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => useUiStore.getState().openTaskDetail(t.id)}
                        className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-[var(--border)] text-muted hover:text-primary hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors flex items-center space-x-1"
                        title="打开任务处理详情"
                        id={`home-task-detail-btn-${t.id}`}
                      >
                        <span>详情</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleOpenCaseTask(t)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-xs flex items-center space-x-1 cursor-pointer transition-opacity"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                        id={`home-task-action-${t.id}`}
                      >
                        <span>进入案件对话</span>
                        <ArrowRight className="w-3 h-3" />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (span-1): Bento 小组件 (Quick Kanban + Expert Tip + AI Chat Box) */}
        <div className="flex flex-col gap-5 h-full">
          
          {/* Widget 1: 快捷看板 (Quick Kanban Stage Progress) */}
          <div className="rounded-2xl border p-4 space-y-3.5 shadow-sm flex-1 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between pb-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-xs font-extrabold text-primary">快捷看板 (Case Stage)</h3>
              </div>
              <span className="text-xs font-extrabold text-muted">共 {cases.length} 笔案件</span>
            </div>

            <div className="space-y-3 flex-1 flex flex-col justify-center">
              {stageBreakdown.map((st, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-secondary text-[11px]">{st.label}</span>
                    <span className="font-mono text-[11px] text-muted">
                      <strong className="text-primary font-bold">{st.count}</strong> 笔 ({st.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${st.pct}%` }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className={`h-full rounded-full ${st.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onNavigate('cases')}
              className="w-full py-2 rounded-xl text-xs font-bold border hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer text-center text-[var(--accent)] flex items-center justify-center space-x-1 flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>进入完整看板 ➔</span>
            </button>
          </div>

          {/* Widget 2: Vera 专家小贴士 (Vera Expert Tip) */}
          <div className="rounded-2xl border p-4 space-y-3 shadow-md bg-[var(--accent-soft)] border-[var(--accent-soft)] relative overflow-hidden flex-shrink-0">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] shadow-xs">
                <Lightbulb className="w-4 h-4" />
              </div>
              <span className="text-xs font-extrabold text-[var(--accent)]">
                Vera 智能专家贴士
              </span>
            </div>

            <p className="text-xs text-secondary leading-relaxed font-medium">
              💡 系统将持续根据活跃案件实况生成审贷风控提醒（补件/截止/政策变化）。
            </p>

            <div className="pt-1 flex items-center justify-between">
              <span className="text-[11px] text-muted font-mono">根据当前活跃案件实况生成</span>
              <button 
                onClick={() => handleStartChat("帮我分析当前案件的下一步加速策略")}
                className="text-[11px] font-extrabold text-[var(--accent)] hover:underline cursor-pointer"
              >
                一键制定加速方案 ➔
              </button>
            </div>
          </div>

          {/* Widget 3: 对话入口 (AI First - 右栏底端对话框) */}
          <div className="rounded-2xl border p-4 space-y-3 shadow-md relative overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-extrabold text-primary">向 AI 提问</h2>
                  <p className="text-[11px] text-muted">随时开始</p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--purple-soft)] text-[var(--purple)]">
                AI Brain Direct
              </span>
            </div>

            {/* Quick Suggestion Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1">
              <span className="text-muted flex-shrink-0 font-medium text-[11px]">快捷发问:</span>
              <button
                onClick={() => handleStartChat("查看当前案件政策风险与替代银行提示")}
                className="px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer text-[11px] font-medium"
              >
                🛡️ 政策提示与备选银行
              </button>
              <button
                onClick={() => handleStartChat("检查申报一致性")}
                className="px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer text-[11px] font-medium"
              >
                📋 申报一致性交叉比对
              </button>
              <button
                onClick={() => handleStartChat("帮 Chen Wei 拟一份对外补件邮件")}
                className="px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer text-[11px] font-medium"
              >
                ✉️ 拟写补件邮件
              </button>
              <button
                onClick={() => handleStartChat("核对 NAB 对自住房 80% LVR 审核与补充要求")}
                className="px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer text-[11px] font-medium"
              >
                🏦 对齐 NAB 审贷政策
              </button>
            </div>

            {/* Input Bar */}
            <div className="flex items-center px-3 py-2 rounded-xl border space-x-2 shadow-inner transition-colors focus-within:border-[var(--border-active)]" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
              <MessageSquare className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
              <input
                id="home-chat-prompt-input"
                type="text"
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStartChat(); }}
                placeholder="例如：检查补件状态、算 LVR、拟写退筹码邮件…"
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-xs w-full text-primary"
              />
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => handleStartChat()}
                disabled={!chatPrompt.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-40 flex items-center space-x-1 flex-shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                id="home-chat-submit-btn"
              >
                <span>开始对话</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
