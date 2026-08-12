import { useEffect } from 'react';
import { subscribeEvents, ServerEvent } from '../services/sseClient';
import { useNotificationStore } from '../stores/notificationStore';

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
    title: '案件批复成功',
    body: 'PERSON_3 CBA 贷款批复通过 ($850,000)',
    createdAt: '2小时前',
    read: false,
  },
];

export function useNotifications(): void {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setNotifications = useNotificationStore((state) => state.setNotifications);

  useEffect(() => {
    const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (isMock) {
      // Initialize 3 mock notifications on load if list is empty
      if (useNotificationStore.getState().notifications.length === 0) {
        setNotifications(INITIAL_MOCK_NOTIFICATIONS);
      }
      return;
    }

    // TODO(WO-08): 与 useTaskSync 合并为单 SSE 连接
    const handleEvent = (e: ServerEvent) => {
      if (e.type === 'task_created') {
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

    const unsubscribe = subscribeEvents(handleEvent);

    return () => {
      unsubscribe();
    };
  }, [addNotification, setNotifications]);
}
