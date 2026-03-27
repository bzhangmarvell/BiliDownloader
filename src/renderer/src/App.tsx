// src/renderer/src/App.tsx

import React, { useState, useEffect } from 'react';
import DownloadPage from './pages/Download';
import TasksPage from './pages/Tasks';
import SettingsPage from './pages/Settings';
import './styles/App.css';

type Page = 'download' | 'tasks' | 'settings';

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

declare global {
  interface Window {
    auth: {
      getQRCode: () => Promise<{ qrKey: string; url: string }>;
      pollQRStatus: (qrKey: string) => Promise<{ success: boolean; cookie?: string }>;
      importCookie: (cookie: string) => Promise<boolean>;
      checkLogin: () => Promise<boolean>;
      logout: () => Promise<boolean>;
    };
    download: {
      createTask: (url: string, options: any) => Promise<{ success: boolean; task?: DownloadTask; error?: string }>;
      startTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      pauseTask: (taskId: string) => Promise<{ success: boolean }>;
      cancelTask: (taskId: string) => Promise<{ success: boolean }>;
      getTask: (taskId: string) => Promise<{ success: boolean; task?: DownloadTask }>;
      getAllTasks: () => Promise<{ success: boolean; tasks: DownloadTask[] }>;
      setConfig: (config: any) => Promise<{ success: boolean }>;
      onTaskCreated: (cb: (task: DownloadTask) => void) => () => void;
      onTaskStarted: (cb: (task: DownloadTask) => void) => () => void;
      onTaskProgress: (cb: (task: DownloadTask) => void) => () => void;
      onTaskCompleted: (cb: (task: DownloadTask) => void) => () => void;
      onTaskError: (cb: (task: DownloadTask, error: string) => void) => () => void;
      onTaskPaused: (cb: (task: DownloadTask) => void) => () => void;
      onTaskCancelled: (cb: (task: DownloadTask) => void) => () => void;
    };
    database: {
      getAllDownloads: () => Promise<{ success: boolean; downloads: any[] }>;
      deleteDownload: (id: string) => Promise<{ success: boolean }>;
    };
    fs: {
      selectFolder: () => Promise<{ success: boolean; path?: string }>;
    };
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('download');
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check login status on mount - but don't auto-login from stored cookie
    // User should explicitly login via QR code
    console.log('[App] App mounted, NOT checking stored cookie');
    // window.auth.checkLogin().then(status => {
    //   console.log('[App] Login status:', status);
    //   setIsLoggedIn(status);
    // });

    // Listen to download events
    const unsubscribers = [
      window.download.onTaskCreated((task) => {
        setTasks(prev => [...prev, task]);
      }),
      window.download.onTaskProgress((task) => {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      }),
      window.download.onTaskCompleted((task) => {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      }),
      window.download.onTaskError((task) => {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      }),
      window.download.onTaskPaused((task) => {
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      }),
      window.download.onTaskCancelled((task) => {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      }),
    ];

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'download':
        return <DownloadPage onTaskCreated={(task) => setTasks(prev => [...prev, task])} />;
      case 'tasks':
        return <TasksPage tasks={tasks} setTasks={setTasks} />;
      case 'settings':
        return <SettingsPage isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">📺</span>
          <h1>BiliDownloader</h1>
        </div>
        <nav className="nav">
          <button 
            className={`nav-btn ${currentPage === 'download' ? 'active' : ''}`}
            onClick={() => setCurrentPage('download')}
          >
            新建下载
          </button>
          <button 
            className={`nav-btn ${currentPage === 'tasks' ? 'active' : ''}`}
            onClick={() => setCurrentPage('tasks')}
          >
            任务列表
            {tasks.filter(t => t.status === 'downloading' || t.status === 'pending').length > 0 && (
              <span className="badge">
                {tasks.filter(t => t.status === 'downloading' || t.status === 'pending').length}
              </span>
            )}
          </button>
          <button 
            className={`nav-btn ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            设置
          </button>
        </nav>
        <div className="login-status">
          {isLoggedIn ? (
            <span className="status-logged-in">✓ 已登录</span>
          ) : (
            <span className="status-not-logged-in">未登录</span>
          )}
        </div>
      </header>
      <main className="app-main">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
