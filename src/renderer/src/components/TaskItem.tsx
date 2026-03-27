// src/renderer/src/components/TaskItem.tsx

import React from 'react';
import './TaskItem.css';

interface DownloadTask {
  id: string;
  title: string;
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'error' | 'paused';
  progress: number;
  speed: number;
  outputPath: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

interface TaskItemProps {
  task: DownloadTask;
  onDelete: () => void;
  onPause: () => void;
  onRetry: () => void;
}

export default function TaskItem({ task, onDelete, onPause, onRetry }: TaskItemProps) {
  const formatSpeed = (speed: number) => {
    if (speed >= 1024) {
      return `${(speed / 1024).toFixed(1)} MB/s`;
    }
    return `${speed.toFixed(0)} KB/s`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const getStatusText = () => {
    switch (task.status) {
      case 'pending':
        return '等待中';
      case 'downloading':
        return '下载中';
      case 'merging':
        return '合并中';
      case 'completed':
        return '已完成';
      case 'error':
        return '错误';
      case 'paused':
        return '已暂停';
      default:
        return task.status;
    }
  };

  const getStatusClass = () => {
    return `status-${task.status}`;
  };

  return (
    <div className={`task-item ${getStatusClass()}`}>
      <div className="task-main">
        <div className="task-header">
          <h4 className="task-title">{task.title}</h4>
          <span className={`task-status ${getStatusClass()}`}>
            {getStatusText()}
          </span>
        </div>

        {task.status === 'downloading' && (
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <div className="progress-info">
              <span className="progress-percent">{task.progress.toFixed(1)}%</span>
              <span className="progress-speed">{formatSpeed(task.speed)}</span>
            </div>
          </div>
        )}

        {task.status === 'merging' && (
          <div className="merging-indicator">
            <div className="spinner" />
            <span>正在合并音视频...</span>
          </div>
        )}

        {task.error && (
          <div className="error-message">{task.error}</div>
        )}

        <div className="task-footer">
          <span className="task-time">
            {task.status === 'completed' 
              ? `完成于 ${formatTime(task.completedAt!)}`
              : `创建于 ${formatTime(task.createdAt)}`}
          </span>
          <span className="task-path">{task.outputPath}</span>
        </div>
      </div>

      <div className="task-actions">
        {(task.status === 'downloading' || task.status === 'paused') && (
          <button 
            className="action-btn pause-btn"
            onClick={onPause}
            title={task.status === 'downloading' ? '暂停' : '继续'}
          >
            {task.status === 'downloading' ? '⏸' : '▶'}
          </button>
        )}
        
        {task.status === 'error' && (
          <button 
            className="action-btn retry-btn"
            onClick={onRetry}
            title="重试"
          >
            🔄
          </button>
        )}
        
        <button 
          className="action-btn delete-btn"
          onClick={onDelete}
          title="删除"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
