// src/main/preload.ts

import { contextBridge, ipcRenderer } from 'electron';
import { DownloadTask } from './download/engine';
import { DownloadOptions } from './bilibili/types';

// Types for the exposed API
interface AuthAPI {
  getQRCode: () => Promise<{ qrKey: string; url: string }>;
  pollQRStatus: (qrKey: string) => Promise<{ success: boolean; cookie?: string }>;
  importCookie: (cookie: string) => Promise<boolean>;
  checkLogin: () => Promise<boolean>;
  logout: () => Promise<boolean>;
}

interface DownloadAPI {
  createTask: (url: string, options: DownloadOptions) => Promise<{ success: boolean; task?: DownloadTask; error?: string }>;
  startTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  pauseTask: (taskId: string) => Promise<{ success: boolean }>;
  cancelTask: (taskId: string) => Promise<{ success: boolean }>;
  getTask: (taskId: string) => Promise<{ success: boolean; task?: DownloadTask }>;
  getAllTasks: () => Promise<{ success: boolean; tasks: DownloadTask[] }>;
  setConfig: (config: any) => Promise<{ success: boolean }>;
  onTaskCreated: (callback: (task: DownloadTask) => void) => () => void;
  onTaskStarted: (callback: (task: DownloadTask) => void) => () => void;
  onTaskProgress: (callback: (task: DownloadTask) => void) => () => void;
  onTaskCompleted: (callback: (task: DownloadTask) => void) => () => void;
  onTaskError: (callback: (task: DownloadTask, error: string) => void) => () => void;
  onTaskPaused: (callback: (task: DownloadTask) => void) => () => void;
  onTaskCancelled: (callback: (task: DownloadTask) => void) => () => void;
}

interface DatabaseAPI {
  getAllDownloads: () => Promise<{ success: boolean; downloads: any[] }>;
  deleteDownload: (id: string) => Promise<{ success: boolean }>;
}

interface FileSystemAPI {
  selectFolder: () => Promise<{ success: boolean; path?: string }>;
}

// Expose protected methods
contextBridge.exposeInMainWorld('auth', {
  getQRCode: () => ipcRenderer.invoke('auth:get-qr-code'),
  pollQRStatus: (qrKey: string) => ipcRenderer.invoke('auth:poll-qr-status', qrKey),
  importCookie: (cookie: string) => ipcRenderer.invoke('auth:import-cookie', cookie),
  checkLogin: () => ipcRenderer.invoke('auth:check-login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
} as AuthAPI);

contextBridge.exposeInMainWorld('download', {
  createTask: (url: string, options: DownloadOptions) => 
    ipcRenderer.invoke('download:create-task', url, options),
  startTask: (taskId: string) => ipcRenderer.invoke('download:start-task', taskId),
  pauseTask: (taskId: string) => ipcRenderer.invoke('download:pause-task', taskId),
  cancelTask: (taskId: string) => ipcRenderer.invoke('download:cancel-task', taskId),
  getTask: (taskId: string) => ipcRenderer.invoke('download:get-task', taskId),
  getAllTasks: () => ipcRenderer.invoke('download:get-all-tasks'),
  setConfig: (config: any) => ipcRenderer.invoke('download:set-config', config),
  onTaskCreated: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-created', listener);
    return () => ipcRenderer.removeListener('download:task-created', listener);
  },
  onTaskStarted: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-started', listener);
    return () => ipcRenderer.removeListener('download:task-started', listener);
  },
  onTaskProgress: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-progress', listener);
    return () => ipcRenderer.removeListener('download:task-progress', listener);
  },
  onTaskCompleted: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-completed', listener);
    return () => ipcRenderer.removeListener('download:task-completed', listener);
  },
  onTaskError: (callback: (task: DownloadTask, error: string) => void) => {
    const listener = (_: any, task: DownloadTask, error: string) => callback(task, error);
    ipcRenderer.on('download:task-error', listener);
    return () => ipcRenderer.removeListener('download:task-error', listener);
  },
  onTaskPaused: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-paused', listener);
    return () => ipcRenderer.removeListener('download:task-paused', listener);
  },
  onTaskCancelled: (callback: (task: DownloadTask) => void) => {
    const listener = (_: any, task: DownloadTask) => callback(task);
    ipcRenderer.on('download:task-cancelled', listener);
    return () => ipcRenderer.removeListener('download:task-cancelled', listener);
  },
} as DownloadAPI);

contextBridge.exposeInMainWorld('database', {
  getAllDownloads: () => ipcRenderer.invoke('db:get-all-downloads'),
  deleteDownload: (id: string) => ipcRenderer.invoke('db:delete-download', id),
} as DatabaseAPI);

contextBridge.exposeInMainWorld('fs', {
  selectFolder: () => ipcRenderer.invoke('fs:select-folder'),
} as FileSystemAPI);

// 通用 API（用于批量下载等功能）
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_: any, ...eventArgs: any[]) => callback(...eventArgs);
    ipcRenderer.on(channel, listener);
  },
});
