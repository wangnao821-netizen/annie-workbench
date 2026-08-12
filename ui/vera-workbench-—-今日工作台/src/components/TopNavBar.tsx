import React from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Bell, 
  Sun, 
  Moon, 
  Sparkles, 
  UserCheck, 
  Bot,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const TopNavBar: React.FC = () => {
  const { 
    searchQuery, 
    setSearchQuery, 
    unreadNotificationsCount, 
    toggleNotificationOpen, 
    isNotificationOpen,
    activeTheme, 
    toggleTheme,
    setCurrentView,
    notifications,
    markNotificationRead,
    markAllNotificationsRead
  } = useWorkbenchStore((s) => ({
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    unreadNotificationsCount: s.unreadNotificationsCount,
    toggleNotificationOpen: s.toggleNotificationOpen,
    isNotificationOpen: s.isNotificationOpen,
    activeTheme: s.activeTheme,
    toggleTheme: s.toggleTheme,
    setCurrentView: s.setCurrentView,
    notifications: s.notifications,
    markNotificationRead: s.markNotificationRead,
    markAllNotificationsRead: s.markAllNotificationsRead
  }));

  return (
    <header 
      id="top-nav-bar"
      className="h-14 border-b border-[#E5E7EB] bg-white/90 backdrop-blur-md px-6 flex items-center justify-between z-30 shrink-0 select-none shadow-xs"
    >
      {/* Left AI Status & Brand Link */}
      <div className="flex items-center space-x-4">
        <motion.div 
          whileTap={{ scale: 0.95 }}
          onClick={() => setCurrentView('home')}
          className="flex items-center space-x-2.5 cursor-pointer group"
          id="brand-logo-btn"
          aria-label="返回首页"
        >
          <div className="flex -space-x-1">
            <div className="w-8 h-8 rounded-full border-2 border-white bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700 shadow-xs">
              AI
            </div>
          </div>
          <div className="text-sm font-medium text-gray-500 hidden sm:block">
            Vera 正在为您监控 <span className="font-bold text-gray-800">14</span> 个活跃案件
          </div>
        </motion.div>
      </div>

      {/* Center Global Search */}
      <div className="flex-1 max-w-md mx-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索案件/客户 (PERSON_1, CBA, Westpac)..."
            aria-label="全局搜索案件与客户"
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              aria-label="清除搜索"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Right Controls: Notifications, Theme, User */}
      <div className="flex items-center space-x-4 relative">
        {/* Notification Bell */}
        <div className="relative">
          <motion.button
            id="notification-bell-btn"
            whileTap={{ scale: 0.95 }}
            onClick={toggleNotificationOpen}
            aria-label="通知列表"
            className="w-8 h-8 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </motion.button>

          {/* Notifications Dropdown */}
          {isNotificationOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 mt-2 w-80 bg-white border border-[#E5E7EB] rounded-xl shadow-lg z-50 overflow-hidden"
              id="notification-dropdown-menu"
            >
              <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-1.5">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-xs text-gray-900">消息与告警通知</span>
                </div>
                {unreadNotificationsCount > 0 && (
                  <button 
                    onClick={markAllNotificationsRead}
                    className="text-[11px] text-blue-600 hover:underline font-semibold"
                  >
                    全部已读
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map((n) => (
                  <div 
                    key={n.id}
                    onClick={() => {
                      markNotificationRead(n.id);
                      if (n.caseId) {
                        setCurrentView('case_detail', n.caseId);
                      }
                      toggleNotificationOpen();
                    }}
                    className={`p-3 text-xs cursor-pointer hover:bg-gray-50 transition-colors ${
                      !n.read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-gray-900">
                        {n.type === 'urgent' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {n.type === 'info' && <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        {n.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        <span>{n.title}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{n.time}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-600 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-[#E5E7EB] bg-gray-50 text-center">
                <button 
                  onClick={() => {
                    setCurrentView('tasks');
                    toggleNotificationOpen();
                  }}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  查看全部案件待办 →
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <motion.button
          id="theme-toggle-btn"
          whileTap={{ scale: 0.95 }}
          onClick={toggleTheme}
          aria-label="切换主题"
          className="w-8 h-8 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          title={`当前主题：${activeTheme}`}
        >
          {activeTheme === 'dark' ? (
            <Moon className="w-4 h-4 text-indigo-500" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
        </motion.button>

        {/* User Profile Info */}
        <div 
          id="user-profile-badge"
          className="flex items-center space-x-2 pl-2 border-l border-[#E5E7EB]"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
            V
          </div>
          <span className="text-sm font-semibold text-gray-900 hidden sm:inline">
            Vera Admin
          </span>
        </div>
      </div>
    </header>
  );
};
