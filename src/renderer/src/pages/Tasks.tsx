// src/renderer/src/pages/Tasks.tsx

import React, { useState } from 'react';
import TaskItem from '../components/TaskItem';
import './Tasks.css';

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

interface TasksPageProps {
  tasks: DownloadTask[];
  setTasks: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
}

type FilterType = 'all' | 'active' | 'completed' | 'error';

export default function TasksPage({ tasks, setTasks }: TasksPageProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredTasks = tasks.filter(task => {
    switch (filter) {
      case 'active':
        return task.status === 'downloading' || task.status === 'pending' || task.status === 'merging' || task.status === 'paused';
      case 'completed':
        return task.status === 'completed';
      case 'error':
        return task.status === 'error';
      default:
        return true;
    }
  });

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task?.status === 'downloading' || task?.status === 'pending') {
      await window.download.cancelTask(taskId);
    }
    await window.database.deleteDownload(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handlePauseTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task?.status === 'downloading') {
      await window.download.pauseTask(taskId);
    } else if (task?.status === 'paused') {
      await window.download.startTask(taskId);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    await window.download.startTask(taskId);
  };

  const activeCount = tasks.filter(t => 
    t.status === 'downloading' || t.status === 'pending' || t.status === 'merging' || t.status === 'paused'
  ).length;

  const completedCount = tasks.filter(t => t.status === 'completed').length;

  const errorCount = tasks.filter(t => t.status === 'error').length;

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <h2>下载任务</h2>
        <div className="task-stats">
          <span className="stat">总计: {tasks.length}</span>
          <span className="stat active">进行中: {activeCount}</span>
          <span className="stat completed">已完成: {completedCount}</span>
          <span className="stat error">错误: {errorCount}</span>
        </div>
      </div>

      <div className="filter-tabs">
        <button 
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
        <button 
          className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          进行中
        </button>
        <button 
          className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          已完成
        </button>
        <button 
          className={`filter-tab ${filter === 'error' ? 'active' : ''}`}
          onClick={() => setFilter('error')}
        >
          错误
        </button>
      </div>

      <div className="tasks-list">
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>暂无{filter === 'all' ? '任务' : filter === 'active' ? '进行中' : filter === 'completed' ? '已完成' : '错误'}任务</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onDelete={() => handleDeleteTask(task.id)}
              onPause={() => handlePauseTask(task.id)}
              onRetry={() => handleRetryTask(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
