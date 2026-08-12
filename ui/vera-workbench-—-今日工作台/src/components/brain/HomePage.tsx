import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  X, 
  Plus, 
  Mail, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  Send, 
  Bot, 
  Calendar, 
  ArrowUpRight, 
  ChevronRight, 
  FileCheck2, 
  DollarSign, 
  Briefcase, 
  CheckSquare, 
  Filter,
  ShieldCheck
} from 'lucide-react';
import { useWorkbenchStore } from '../../store/useStore';
import { TaskItem, TaskPriority } from '../../types';

export const HomePage: React.FC = () => {
  const { 
    analytics, 
    tasks, 
    dueAlertBannerDismissed, 
    dismissDueAlertBanner, 
    toggleTaskStatus, 
    setCurrentView,
    setSelectedCaseId,
    setNewCaseModalOpen,
    setEmailComposeOpen,
    sendChatMessage,
    isSendingChat
  } = useWorkbenchStore((s) => ({
    analytics: s.analytics,
    tasks: s.tasks,
    dueAlertBannerDismissed: s.dueAlertBannerDismissed,
    dismissDueAlertBanner: s.dismissDueAlertBanner,
    toggleTaskStatus: s.toggleTaskStatus,
    setCurrentView: s.setCurrentView,
    setSelectedCaseId: s.setSelectedCaseId,
    setNewCaseModalOpen: s.setNewCaseModalOpen,
    setEmailComposeOpen: s.setEmailComposeOpen,
    sendChatMessage: s.sendChatMessage,
    isSendingChat: s.isSendingChat
  }));

  const [taskFilter, setTaskFilter] = useState<'all' | 'overdue' | 'high_priority' | 'ai_suggested'>('all');
  const [homeChatInput, setHomeChatInput] = useState('');

  // Get current date string
  const todayDateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  // Calculate overdue & urgent items
  const overdueTasks = tasks.filter(t => t.status !== 'completed' && t.overdueDays && t.overdueDays > 0);
  const dueTodayTasks = tasks.filter(t => t.status !== 'completed' && t.dueDate === '2026-08-12');

  // Sort tasks: Overdue first, then by priority, then by due date
  const sortedTasks = [...tasks].sort((a, b) => {
    // Completed items go to the bottom
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;

    // Overdue items go first
    const aOverdue = a.overdueDays || 0;
    const bOverdue = b.overdueDays || 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    // Priority rank
    const priorityRank: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    return priorityRank[b.priority] - priorityRank[a.priority];
  });

  // Filter sorted tasks based on tab
  const filteredTasks = sortedTasks.filter(t => {
    if (taskFilter === 'overdue') return t.status !== 'completed' && t.overdueDays && t.overdueDays > 0;
    if (taskFilter === 'high_priority') return t.priority === 'urgent' || t.priority === 'high';
    if (taskFilter === 'ai_suggested') return t.isAiSuggested;
    return true;
  });

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-800">紧急</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">高优先级</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">中等</span>;
      case 'low':
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">低</span>;
    }
  };

  const handleSendHomeChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeChatInput.trim() || isSendingChat) return;
    const query = homeChatInput;
    setHomeChatInput('');
    sendChatMessage(query);
  };

  return (
    <div id="home-workbench-page" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. Overdue / Due Warning Alert Banner */}
      <AnimatePresence>
        {!dueAlertBannerDismissed && (overdueTasks.length > 0 || dueTodayTasks.length > 0) && (
          <motion.div
            id="due-warning-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center justify-between shadow-xs z-10"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <p className="text-sm text-red-800 font-medium">
                紧急：您今天有 <span className="font-bold text-red-900">{overdueTasks.length}</span> 个待办事项已逾期，建议优先处理「{overdueTasks[0]?.clientName || 'PERSON_1'}」的材料补交与审核。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                id="banner-followup-btn"
                onClick={() => setTaskFilter('overdue')}
                className="text-xs bg-red-600 text-white px-3 py-1 rounded-md font-bold hover:bg-red-700 transition-colors shadow-2xs"
              >
                查看逾期待办
              </button>
              <button
                id="dismiss-banner-btn"
                onClick={dismissDueAlertBanner}
                className="text-red-400 hover:text-red-600 font-bold px-1.5 py-0.5 text-base"
                aria-label="关闭提醒条"
              >
                &times;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Today Overview Header & Quick Action Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            2026年8月12日，星期三
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            今天 {tasks.filter(t => t.status !== 'completed').length} 个待办 · {overdueTasks.length + dueTodayTasks.length} 个到期/逾期 · 1 个银行回复待处理
          </p>
        </div>

        {/* Quick Actions (Bento Action Buttons) */}
        <div className="flex items-center gap-3 shrink-0">
          <motion.button
            id="quick-new-case-btn"
            whileTap={{ scale: 0.97 }}
            onClick={() => setNewCaseModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 flex items-center gap-2 transition-all"
            aria-label="新建案件"
          >
            <Plus className="w-4 h-4" />
            <span>新建案件</span>
          </motion.button>

          <motion.button
            id="quick-email-btn"
            whileTap={{ scale: 0.97 }}
            onClick={() => setEmailComposeOpen(true)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 flex items-center gap-2 transition-all"
            aria-label="写邮件"
          >
            <Mail className="w-4 h-4 text-blue-600" />
            <span>写邮件</span>
          </motion.button>

          <motion.button
            id="quick-analytics-btn"
            whileTap={{ scale: 0.97 }}
            onClick={() => setCurrentView('analytics')}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 flex items-center gap-2 transition-all"
            aria-label="统计视图"
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <span>统计视图</span>
          </motion.button>
        </div>
      </div>

      {/* 3. Bento 4-Stat Metric Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 活跃案件 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">活跃案件</div>
          <div className="text-2xl font-bold text-gray-900 flex items-baseline gap-1">
            {analytics.activeCases} <span className="text-xs font-normal text-green-500 ml-1">+2 推进</span>
          </div>
        </div>

        {/* Card 2: 本周/本月新增 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">本月新增</div>
          <div className="text-2xl font-bold text-gray-900">
            0{analytics.newCasesThisMonth}
          </div>
        </div>

        {/* Card 3: 已递交银行 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">已递交银行</div>
          <div className="text-2xl font-bold text-gray-900">
            0{analytics.submittedCases}
          </div>
        </div>

        {/* Card 4: 预估佣金 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">预估佣金</div>
          <div className="text-2xl font-bold text-gray-900">
            {analytics.expectedCommission}
          </div>
        </div>
      </div>

      {/* 4. Bento Grid Main Content Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (span-2): Today Tasks List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-gray-800 text-base">今日待办</h2>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 text-xs bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setTaskFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  taskFilter === 'all' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                全部 ({tasks.length})
              </button>
              <button
                onClick={() => setTaskFilter('overdue')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  taskFilter === 'overdue' ? 'bg-red-500 text-white font-bold' : 'text-red-600 hover:bg-red-50'
                }`}
              >
                逾期 ({overdueTasks.length})
              </button>
              <button
                onClick={() => setTaskFilter('ai_suggested')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  taskFilter === 'ai_suggested' ? 'bg-blue-600 text-white font-bold' : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                AI 建议
              </button>
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-3" id="today-tasks-container">
            {filteredTasks.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <p className="font-bold text-gray-800 text-sm">暂无此类型待办事项</p>
                <p>所有跟进事项均已高效处理完毕。</p>
              </div>
            ) : (
              filteredTasks.map((t) => {
                const isDone = t.status === 'completed';
                const isOverdue = !isDone && t.overdueDays && t.overdueDays > 0;

                return (
                  <motion.div
                    key={t.id}
                    id={`task-row-${t.id}`}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setSelectedCaseId(t.caseId);
                      setCurrentView('case_detail', t.caseId);
                    }}
                    className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-colors shadow-sm p-4 ${
                      isOverdue
                        ? 'border-red-200 hover:border-red-400'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {/* Badge Tag */}
                          {isOverdue ? (
                            <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                              已逾期 {t.overdueDays} 天
                            </span>
                          ) : t.isAiSuggested ? (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                              AI 建议
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              常规任务
                            </span>
                          )}

                          <span className={`text-sm font-bold ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {t.title}
                          </span>
                        </div>

                        <div className="text-xs text-gray-500">
                          {t.clientName} · {t.bankName} {t.description ? `· ${t.description}` : ''}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-gray-400">截止日: {t.dueDate}</div>
                        <div className={`text-xs font-bold ${isOverdue ? 'text-red-500' : t.priority === 'urgent' ? 'text-red-500' : 'text-blue-500'}`}>
                          {isOverdue ? '极紧急' : t.priority === 'urgent' ? '紧急' : t.priority === 'high' ? '高' : '中等'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (span-1): Bento Widgets */}
        <div className="space-y-6">
          {/* Widget 1: 快捷看板 (Quick Pipeline Stage Progress) */}
          <div>
            <h2 className="font-bold text-gray-800 mb-3 text-base">快捷看板</h2>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 font-medium">资料收集与审核中</span>
                    <span className="font-bold text-gray-900">4</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full w-[40%] rounded-full"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 font-medium">银行递交与审批中</span>
                    <span className="font-bold text-gray-900">2</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full w-[20%] rounded-full"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 font-medium">预批与正式批复</span>
                    <span className="font-bold text-gray-900">3</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[30%] rounded-full"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 font-medium">待结算割接 (Settlement)</span>
                    <span className="font-bold text-gray-900">1</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full w-[10%] rounded-full"></div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCurrentView('kanban')}
                className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-blue-600 text-center transition-colors block"
              >
                进入完整看板 pipeline →
              </button>
            </div>
          </div>

          {/* Widget 2: Vera 专家小贴士 (Bento Gradient Highlight Box) */}
          <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10 space-y-2">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <h3 className="font-bold text-sm">Vera 专家小贴士</h3>
              </div>
              <p className="text-xs text-indigo-100 leading-relaxed opacity-95">
                “目前 CBA 与 Westpac 的初审响应较快。建议将 PERSON_1 的 HECS 补件在下午 3 点前提交至 Lender Portal，以确保赶上今日审批批次。”
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Floating AI Dialogue Bar */}
      <div className="pt-2">
        <div className="max-w-4xl mx-auto bg-white border border-blue-100 rounded-2xl p-3 shadow-sm space-y-2">
          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap gap-1.5 px-1">
            {[
              '分析 PERSON_1 (CBA) 补件逾期应对方案',
              '比较 Westpac vs ANZ 自雇借贷能力计算',
              '帮我拟一份客户周六拍卖注意事项邮件'
            ].map((p, i) => (
              <button
                key={i}
                onClick={() => setHomeChatInput(p)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-all font-medium"
              >
                ✨ {p}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendHomeChat} className="relative flex items-center">
            <div className="absolute left-3.5 inset-y-0 flex items-center pointer-events-none">
              <div className="w-5 h-5 border-2 border-blue-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
            </div>
            <input
              type="text"
              value={homeChatInput}
              onChange={(e) => setHomeChatInput(e.target.value)}
              placeholder="直接向 Vera 提问，例如：“帮我分析下 PERSON_1 目前的案件风险”"
              className="w-full pl-11 pr-24 py-3 bg-gray-50 border border-blue-100 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none transition-all shadow-xs placeholder-gray-400"
              aria-label="与 Vera 对话"
            />
            <div className="absolute right-2 inset-y-2 flex items-center">
              <button
                type="submit"
                disabled={isSendingChat || !homeChatInput.trim()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-xs disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>{isSendingChat ? '思考中' : '发送'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
