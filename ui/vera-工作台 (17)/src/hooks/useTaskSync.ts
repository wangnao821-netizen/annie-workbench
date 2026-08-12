import { useEffect, useRef } from 'react';
import { subscribeEvents, ServerEvent } from '../services/sseClient';
import { mapTaskResponse, isTaskResponse } from '../services/taskMapper';
import { useTaskStore } from '../stores/taskStore';

export function useTaskSync(): void {
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (isMock) {
      return;
    }

    const startPolling = () => {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          fetchTasks();
        }, 10000);
      }
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleStatusChange = (connected: boolean) => {
      if (connected) {
        stopPolling();
        fetchTasks();
      } else {
        startPolling();
      }
    };

    const handleEvent = (e: ServerEvent) => {
      if (e.type === 'task_created') {
        if (!isTaskResponse(e.data)) {
          console.warn('[SSE] malformed task payload ignored');
          return;
        }
        const newTask = mapTaskResponse(e.data);
        useTaskStore.setState((state) => {
          if (state.tasks.some((t) => t.id === newTask.id)) {
            return state;
          }
          return { tasks: [newTask, ...state.tasks] };
        });
      } else if (e.type === 'task_updated') {
        if (!isTaskResponse(e.data)) {
          console.warn('[SSE] malformed task payload ignored');
          return;
        }
        const updatedTask = mapTaskResponse(e.data);
        useTaskStore.setState((state) => ({
          tasks: state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
        }));
      } else if (e.type === 'heartbeat') {
        useTaskStore.setState({ lastUpdated: new Date().toISOString() });
      }
    };

    const unsubscribe = subscribeEvents(handleEvent, handleStatusChange);

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [fetchTasks]);
}
