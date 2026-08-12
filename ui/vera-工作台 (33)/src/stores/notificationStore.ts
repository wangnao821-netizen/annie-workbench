import { create } from 'zustand';

export type NotificationLevel = 'urgent' | 'success' | 'info';

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  setNotifications: (items: AppNotification[]) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (n) =>
    set((state) => {
      const newNotif: AppNotification = {
        ...n,
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        read: false,
        createdAt: '刚刚',
      };
      const updated = [newNotif, ...state.notifications].slice(0, 30);
      return {
        notifications: updated,
        unreadCount: updated.filter((item) => !item.read).length,
      };
    }),

  markRead: (id) =>
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((item) => !item.read).length,
      };
    }),

  markAllRead: () =>
    set((state) => {
      const updated = state.notifications.map((n) => ({ ...n, read: true }));
      return {
        notifications: updated,
        unreadCount: 0,
      };
    }),

  clearAll: () =>
    set({
      notifications: [],
      unreadCount: 0,
    }),

  setNotifications: (items) =>
    set({
      notifications: items,
      unreadCount: items.filter((n) => !n.read).length,
    }),
}));
