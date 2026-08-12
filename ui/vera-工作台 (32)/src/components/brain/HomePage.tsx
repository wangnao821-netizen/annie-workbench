import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Sparkles, Plus, Mail, BarChart2, AlertTriangle, 
  Calendar, CheckCircle2, ArrowRight, 
  RefreshCw, User, Briefcase, FileText, X, MessageSquare,
  Lightbulb, Layers
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
  const [taskTab, setTaskTab] = useState<'all' | 'overdue' | 'ai'>('all');
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
      { label: '资料收集', count: counts.collecting, pct: Math.round((counts.collecting / total) * 100), color: 'bg-blue-500' },
      { label: '银行递交', count: counts.submitted, pct: Math.round((counts.submitted / total) * 100), color: 'bg-amber-500' },
      { label: '预批批复', count: counts.approved, pct: Math.round((counts.approved / total) * 100), color: 'bg-emerald-500' },
      { label: '待结算', count: counts.settling, pct: Math.round((counts.settling / total) * 100), color: 'bg-purple-500' },
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
      onNavigate('tasks');
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">🔥 紧急</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">⚡ 优先</span>;
      case 'normal':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">常规</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] text-muted bg-black/5 dark:bg-white/10">低级</span>;
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
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="p-3.5 rounded-2xl border flex items-center justify-between text-xs font-semibold shadow-md glass-card border-amber-500/30 text-amber-900 dark:text-amber-200"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
            id="overdue-banner"
          >
            <div className="flex items-center space-x-3 truncate">
              <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex-shrink-0 relative">
                <AlertTriangle className="w-4 h-4" />
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              </div>
              <div className="truncate">
                <span className="font-extrabold text-amber-600 dark:text-amber-400 mr-2">到期/逾期预警：</span>
                <span className="text-secondary">当前有 <strong className="text-rose-600 dark:text-rose-400 font-extrabold">{overdueTasks.length} 项紧急待办</strong> 超期或今日到期（如 NAB / CBA 补件要求），请优先跟进！</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setTaskTab('overdue')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
              >
                查看逾期待办 ➔
              </motion.button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-primary cursor-pointer transition-colors"
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
              <Calendar className="w-6 h-6 text-purple-500 inline-block flex-shrink-0" />
              <span>{todayDateStr}</span>
            </h1>
            <p className="text-xs text-muted">
              今天有 <strong className="text-rose-500 font-bold">{overdueTasks.length} 个紧急待办</strong> · 2 个到期预警 · 1 个银行审贷回复待处理
            </p>
          </div>

          {/* 3. 快捷操作按钮 (3 Actions) */}
          <div className="flex items-center space-x-2 pt-2 md:pt-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setNewCaseOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-md flex items-center space-x-1.5 cursor-pointer hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--accent)' }}
              id="quick-new-case-btn"
            >
              <Plus className="w-4 h-4" />
              <span>新建案件</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleStartChat("帮我拟一份对外补件邮件草稿")}
              className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors glass-card"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="quick-compose-mail-btn"
            >
              <Mail className="w-3.5 h-3.5 text-blue-500" />
              <span>写邮件</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate('analytics')}
              className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors glass-card"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="quick-analytics-btn"
            >
              <BarChart2 className="w-3.5 h-3.5 text-purple-500" />
              <span>统计视图</span>
            </motion.button>
          </div>
        </div>

        {/* 4. Bento 统计数字卡片 (4 Stat Cards with Hover Lift) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Active Cases */}
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow glass-card relative overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between text-muted text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[10px]">活跃案件</span>
              <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-500">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-primary">
                {analyticsOverview?.active_cases.value ?? cases.length}
              </span>
              <span className="text-[10px] font-bold text-emerald-500">
                +{analyticsOverview?.active_cases.change_pct ?? 12.5}%
              </span>
            </div>
            <p className="text-[10px] text-muted truncate">进行中与审贷中案件</p>
          </motion.div>

          {/* New Cases */}
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow glass-card relative overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between text-muted text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[10px]">本月新增</span>
              <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
                <Plus className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-primary">
                {analyticsOverview?.new_cases.value ?? 3}
              </span>
              <span className="text-[10px] font-bold text-emerald-500">
                +{analyticsOverview?.new_cases.change_pct ?? 33.3}%
              </span>
            </div>
            <p className="text-[10px] text-muted truncate">新进入意向/预审客户</p>
          </motion.div>

          {/* Submitted Cases */}
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow glass-card relative overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between text-muted text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[10px]">已递交</span>
              <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-primary">
                {analyticsOverview?.submitted_cases.value ?? 8}
              </span>
              <span className="text-[10px] font-bold text-emerald-500">
                +{analyticsOverview?.submitted_cases.change_pct ?? 25.0}%
              </span>
            </div>
            <p className="text-[10px] text-muted truncate">银行审贷评估中</p>
          </motion.div>

          {/* Expected Commission */}
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="p-4 rounded-2xl border space-y-2 shadow-2xs hover:shadow-md transition-shadow glass-card relative overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between text-muted text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[10px]">预估佣金 (AUD)</span>
              <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 font-extrabold text-xs">
                $
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                ${(analyticsOverview?.commission.value ?? 48200).toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-emerald-500">
                +{analyticsOverview?.commission.change_pct ?? 21.4}%
              </span>
            </div>
            <p className="text-[10px] text-muted truncate">预计放款结算佣金</p>
          </motion.div>
        </div>
      </div>

      {/* 5. 主内容区 (Bento 双栏 Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        
        {/* Left Column (span-2): 今日待办 */}
        <div className="lg:col-span-2 rounded-2xl border p-5 space-y-4 shadow-sm glass-panel" style={{ borderColor: 'var(--border)' }}>
          {/* Section Header & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4.5 h-4.5 text-purple-500" />
              <h2 className="text-sm font-extrabold tracking-tight text-primary">
                今日待办 (Today's Priorities)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {sortedTasks.length} 项
              </span>
            </div>

            {/* Filter Tabs (全部 / 逾期 / AI 建议) */}
            <div className="flex items-center space-x-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setTaskTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  taskTab === 'all' ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs' : 'text-muted hover:text-primary'
                }`}
              >
                <span>全部</span>
                <span className="text-[10px] opacity-75">({tasks.filter(t => !t.completed).length})</span>
              </button>

              <button
                onClick={() => setTaskTab('overdue')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  taskTab === 'overdue' ? 'bg-[var(--bg-card)] text-rose-500 shadow-2xs' : 'text-muted hover:text-primary'
                }`}
              >
                <span>逾期/紧急</span>
                {overdueTasks.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-extrabold">
                    {overdueTasks.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setTaskTab('ai')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  taskTab === 'ai' ? 'bg-[var(--bg-card)] text-purple-500 shadow-2xs' : 'text-muted hover:text-primary'
                }`}
              >
                <span>AI 建议</span>
                {aiSuggestedTasks.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-purple-500 text-white text-[10px] font-extrabold">
                    {aiSuggestedTasks.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Task Items list */}
          {tasksLoading ? (
            <div className="p-8 text-center text-xs text-muted space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-purple-500" />
              <p>正在获取最新待办清单...</p>
            </div>
          ) : tasksError ? (
            <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
              <span>{tasksError}</span>
              <button onClick={() => fetchTasks()} className="px-2.5 py-1 rounded-lg bg-rose-500 text-white font-bold cursor-pointer">
                重试
              </button>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm text-primary">太棒了！当前分类下暂无待办事项</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  所有对应案件与补件任务已全部跟进完毕。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedTasks.map((t) => {
                const isUrgent = t.priority === 'urgent' || t.tags.some(tag => tag.label.includes('超期') || tag.label.includes('逾期'));
                const isAi = Boolean(t.aiSummary) || t.type === 'OS_ATTACK';

                return (
                  <motion.div
                    key={t.id}
                    whileHover={{ y: -1 }}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      isUrgent ? 'bg-rose-500/5 border-rose-500/30' : 'bg-[var(--bg-card)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                    id={`home-task-item-${t.id}`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {/* Overdue / AI / Normal Badge */}
                        {isUrgent ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white shadow-2xs">
                            已逾期 2 天
                          </span>
                        ) : isAi ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            🤖 AI 建议
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10 text-muted">
                            常规待办
                          </span>
                        )}

                        {/* Priority Badge */}
                        {getPriorityBadge(t.priority)}

                        {/* Client Name */}
                        {t.caseName && (
                          <span className="font-extrabold text-xs text-primary flex items-center">
                            <User className="w-3 h-3 mr-1 text-muted inline" />
                            {t.caseName}
                          </span>
                        )}

                        {/* Lender */}
                        {t.caseBank && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            {t.caseBank}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-xs text-primary leading-tight">
                        {t.title}
                      </h3>

                      {t.aiSummary && (
                        <p className="text-[11px] text-muted line-clamp-1">
                          {t.aiSummary}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 self-end md:self-center">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleOpenCaseTask(t)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs flex items-center space-x-1 cursor-pointer transition-opacity"
                        style={{ backgroundColor: 'var(--accent)' }}
                        id={`home-task-action-${t.id}`}
                      >
                        <span>进入案件对话</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (span-1): Bento 小组件 (Quick Kanban + Expert Tip) */}
        <div className="space-y-5">
          
          {/* Widget 1: 快捷看板 (Quick Kanban Stage Progress) */}
          <div className="rounded-2xl border p-4 space-y-3.5 shadow-sm glass-panel" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-extrabold text-primary">快捷看板 (Case Stage)</h3>
              </div>
              <span className="text-[10px] font-extrabold text-muted">共 {cases.length} 笔案件</span>
            </div>

            <div className="space-y-3">
              {stageBreakdown.map((st, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-secondary text-[11px]">{st.label}</span>
                    <span className="font-mono text-[10px] text-muted">
                      <strong className="text-primary font-bold">{st.count}</strong> 笔 ({st.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
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
              className="w-full py-2 rounded-xl text-xs font-bold border hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer text-center text-[var(--accent)] flex items-center justify-center space-x-1"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>进入完整看板 ➔</span>
            </button>
          </div>

          {/* Widget 2: Vera 专家小贴士 (Vera Expert Tip) */}
          <div className="rounded-2xl border p-4 space-y-3 shadow-md bg-gradient-to-br from-indigo-600/10 via-purple-600/10 to-amber-500/10 border-indigo-500/30 relative overflow-hidden">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                <Lightbulb className="w-4 h-4" />
              </div>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                Vera 智能专家贴士
              </span>
            </div>

            <p className="text-xs text-secondary leading-relaxed font-medium">
              💡 <strong>审贷风控提醒：</strong> 陈伟案件 (NAB) Finance Clause 契约日仅剩 2 天，建议今天跟进 BDM 确认预审进度；另外 PERSON_1 (CBA) 补充 2025 最新 NOA 税单可提升 15% 审批成功率。
            </p>

            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-muted font-mono">根据当前活跃案件实况生成</span>
              <button 
                onClick={() => handleStartChat("帮我分析陈伟和 PERSON_1 案件的下一步加速策略")}
                className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                一键制定加速方案 ➔
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 6. 对话入口 (AI First - 首页常驻对话框) */}
      <div className="rounded-2xl border p-4 space-y-3 shadow-md glass-panel relative overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-500">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-primary">直接与 Vera 说话 (AI First Chat Entry)</h2>
              <p className="text-[10px] text-muted">随时开聊，无需先选案件即可咨询贷款计算、政策解析或材料生成</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">
            AI Brain Direct
          </span>
        </div>

        {/* Input Bar */}
        <div className="flex items-center px-3 py-2.5 rounded-xl border space-x-2 shadow-inner" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <MessageSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <input
            id="home-chat-prompt-input"
            type="text"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStartChat(); }}
            placeholder="例如：帮 Chen Wei 检查补件状态、计算 85% LVR 豁免 LMI 条件、或拟写退筹码邮件..."
            className="bg-transparent border-none outline-none text-xs w-full text-primary"
          />
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleStartChat()}
            disabled={!chatPrompt.trim()}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-40 flex items-center space-x-1"
            style={{ backgroundColor: 'var(--accent)' }}
            id="home-chat-submit-btn"
          >
            <span>开始对话</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar text-[11px] pt-1">
          <span className="text-muted flex-shrink-0 font-medium">快捷发问:</span>
          <button
            onClick={() => handleStartChat("帮 Chen Wei 拟一份对外补件邮件")}
            className="px-2.5 py-1 rounded-lg border bg-black/5 dark:bg-white/5 hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer flex-shrink-0"
          >
            ✉️ 拟写补件邮件
          </button>
          <button
            onClick={() => handleStartChat("核对 NAB 对自住房 80% LVR 审核与补充要求")}
            className="px-2.5 py-1 rounded-lg border bg-black/5 dark:bg-white/5 hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer flex-shrink-0"
          >
            🏦 对齐 NAB 审贷政策
          </button>
          <button
            onClick={() => handleStartChat("检查所有案件 Finance Clause 到期倒计时")}
            className="px-2.5 py-1 rounded-lg border bg-black/5 dark:bg-white/5 hover:bg-[var(--bg-card-hover)] text-secondary transition-colors cursor-pointer flex-shrink-0"
          >
            ⏳ 检查 Finance Due 预警
          </button>
        </div>
      </div>

    </div>
  );
}
