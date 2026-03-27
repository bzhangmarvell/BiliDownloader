// src/renderer/src/store/downloadStore.ts

import { create } from 'zustand';

interface DownloadTask {
  id: string;
  bvid: string;
  cid: number;
  title: string;
  quality: number;
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'error' | 'paused';
  progress: number;
  speed: number;
  outputPath: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

interface DownloadState {
  tasks: DownloadTask[];
  addTask: (task: DownloadTask) => void;
  updateTask: (taskId: string, updates: Partial<DownloadTask>) => void;
  removeTask: (taskId: string) => void;
  getTask: (taskId: string) => DownloadTask | undefined;
  getActiveTasks: () => DownloadTask[];
  getCompletedTasks: () => DownloadTask[];
  clearCompleted: () => void;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],
  
  addTask: (task) => set((state) => ({ 
    tasks: [...state.tasks, task] 
  })),
  
  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ),
  })),
  
  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(task => task.id !== taskId),
  })),
  
  getTask: (taskId) => get().tasks.find(task => task.id === taskId),
  
  getActiveTasks: () => get().tasks.filter(task => 
    task.status === 'downloading' || 
    task.status === 'pending' || 
    task.status === 'merging' ||
    task.status === 'paused'
  ),
  
  getCompletedTasks: () => get().tasks.filter(task => 
    task.status === 'completed'
  ),
  
  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter(task => task.status !== 'completed'),
  })),
}));
