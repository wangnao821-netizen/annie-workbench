import { useEffect } from 'react';
import { FilterId } from '../types';
import { useTaskStore } from '../stores/taskStore';
import { TaskList } from '../components/tasks/TaskList';
import { DetailPanel } from '../components/panel/DetailPanel';

interface TaskWorkbenchProps {
  activeFilter: FilterId;
}

export function TaskWorkbench({ activeFilter }: TaskWorkbenchProps) {
  const { setFilter, fetchTasks } = useTaskStore();

  // Fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Sync prop filter changes with Zustand taskStore
  useEffect(() => {
    setFilter(activeFilter);
  }, [activeFilter, setFilter]);

  return (
    <div className="flex-1 flex overflow-hidden h-full" id="task-workbench-container">
      {/* Task List Panel (Left 380px) */}
      <TaskList />

      {/* Right Detail Panel Area (flex: 1) */}
      <DetailPanel />
    </div>
  );
}
