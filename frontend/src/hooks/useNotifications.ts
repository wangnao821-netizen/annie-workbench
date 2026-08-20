import { useEffect } from 'react';
import { subscribeEvents, ServerEvent } from '../services/sseClient';
import { useNotificationStore } from '../stores/notificationStore';
import { useChecklistStore } from '../stores/checklistStore';

const INITIAL_MOCK_NOTIFICATIONS = [
  {
    id: 'notif-mock-1',
    level: 'urgent' as const,
    title: '紧急 OS 条件到期提醒',
    body: 'PERSON_1 案件待补会计师说明信 (Finance Due 3天内)',
    createdAt: '10分钟前',
    read: false,
  },
  {
    id: 'notif-mock-2',
    level: 'info' as const,
    title: '来自 NAB BDM 的新邮件',
    body: '已收到 PERSON_2 预批条件确认函，请及时核对',
    createdAt: '30分钟前',
    read: false,
  },
  {
    id: 'notif-mock-3',
    level: 'success' as const,
    title: '材料到了：payslip_2026_01.pdf',
    body: '（已自动匹配清单：最新 2 期工资单）',
    createdAt: '1小时前',
    read: false,
  },
];

export function useNotifications(): void {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setNotifications = useNotificationStore((state) => state.setNotifications);

  useEffect(() => {
    const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (isMock && useNotificationStore.getState().notifications.length === 0) {
      setNotifications(INITIAL_MOCK_NOTIFICATIONS);
    }

    const processFileDiscovered = (data: Record<string, unknown>) => {
      const caseId = String(data.case_id || '');
      const fileId = String(data.file_id || `file-${Date.now()}`);
      const originalName = String(data.original_name || '新材料文件');
      const matchedList = Array.isArray(data.matched) ? (data.matched as string[]) : [];
      const hasMatched = matchedList.length > 0;

      if (hasMatched) {
        addNotification({
          level: 'success',
          title: `材料到了：${originalName}`,
          body: `（已自动匹配清单${matchedList.length > 0 ? `: ${matchedList.join(', ')}` : ''}）`,
        });
        useChecklistStore.getState().applyAutoMatch(caseId, fileId, originalName, matchedList);
      } else {
        addNotification({
          level: 'info',
          title: `材料到了：${originalName}`,
          body: '（待确认）',
        });
      }
    };

    const handleEvent = (e: ServerEvent) => {
      if (e.type === 'file_discovered') {
        processFileDiscovered(e.data);
      } else if (e.type === 'task_created') {
        const bodyStr = typeof e.data?.title === 'string' ? e.data.title : '新任务已创建';
        addNotification({
          level: 'info',
          title: '新任务',
          body: bodyStr,
        });
      } else if (e.type === 'task_updated') {
        const bodyStr = typeof e.data?.title === 'string' ? e.data.title : '任务状态已变动';
        addNotification({
          level: 'info',
          title: '任务更新',
          body: bodyStr,
        });
      } else if (e.type === 'case_updated') {
        const bodyStr = typeof e.data?.clientName === 'string' ? `${e.data.clientName} 案件状态更新` : '案件状态已变动';
        addNotification({
          level: 'info',
          title: '案件更新',
          body: bodyStr,
        });
      }
    };

    const handleCustomMockEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        processFileDiscovered(customEvent.detail);
      }
    };

    window.addEventListener('mock_file_discovered', handleCustomMockEvent);
    const unsubscribe = subscribeEvents(handleEvent);

    return () => {
      window.removeEventListener('mock_file_discovered', handleCustomMockEvent);
      unsubscribe();
    };
  }, [addNotification, setNotifications]);
}
