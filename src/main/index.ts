// src/main/index.ts

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { authManager } from './bilibili/auth';
import { downloadEngine, DownloadTask } from './download/engine';
import { DownloadOptions } from './bilibili/types';
import { initDatabase, insertDownload, updateDownloadStatus, getAllDownloads, deleteDownload } from './storage/database';
import { setFfmpegPath } from './utils/ffmpeg';
import './utils/logger'; // Enable logging to file

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    titleBarStyle: 'hiddenInset',
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize app
app.whenReady().then(() => {
  initDatabase();
  setFfmpegPath();
  
  // Load saved cookie on startup
  const loadedCookie = authManager.loadCookie();
  if (loadedCookie) {
    console.log('[Main] Loaded saved cookie from store');
    // Don't auto-validate, just keep it for use
  } else {
    console.log('[Main] No saved cookie found');
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Auth
ipcMain.handle('auth:get-qr-code', async () => {
  return await authManager.getQRCode();
});

ipcMain.handle('auth:poll-qr-status', async (_, qrKey: string) => {
  return await authManager.pollQRStatus(qrKey);
});

ipcMain.handle('auth:import-cookie', async (_, cookie: string) => {
  return await authManager.importCookie(cookie);
});

ipcMain.handle('auth:check-login', async () => {
  const result = await authManager.validateCookie();
  console.log('[IPC] auth:check-login result:', result);
  return result;
});

ipcMain.handle('auth:logout', async () => {
  console.log('[IPC] auth:logout requested');
  console.log('[IPC] loginStatus before logout:', authManager.isLoggedIn());
  await authManager.logout();
  console.log('[IPC] loginStatus after logout:', authManager.isLoggedIn());
  return true;
});

// Download
ipcMain.handle('download:create-task', async (_, url: string, options: DownloadOptions) => {
  try {
    const task = await downloadEngine.createTask(url, options);
    return { success: true, task };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:start-task', async (_, taskId: string) => {
  try {
    await downloadEngine.startTask(taskId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:pause-task', async (_, taskId: string) => {
  downloadEngine.pauseTask(taskId);
  return { success: true };
});

ipcMain.handle('download:cancel-task', async (_, taskId: string) => {
  downloadEngine.cancelTask(taskId);
  return { success: true };
});

ipcMain.handle('download:get-task', async (_, taskId: string) => {
  const task = downloadEngine.getTask(taskId);
  return { success: true, task };
});

ipcMain.handle('download:get-all-tasks', async () => {
  const tasks = downloadEngine.getAllTasks();
  return { success: true, tasks };
});

ipcMain.handle('download:set-config', async (_, config: any) => {
  downloadEngine.setConfig(config);
  return { success: true };
});

// Database
ipcMain.handle('db:get-all-downloads', async () => {
  const downloads = getAllDownloads();
  return { success: true, downloads };
});

ipcMain.handle('db:delete-download', async (_, id: string) => {
  deleteDownload(id);
  return { success: true };
});

// File system
ipcMain.handle('fs:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return { success: !result.canceled, path: result.filePaths[0] };
});

// ============ 批量下载相关 IPC ============

// 获取 UP 主信息
ipcMain.handle('up:get-info', async (_, mid: number) => {
  try {
    const info = await authManager.getUpInfo(mid);
    return { success: true, info };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 获取 UP 主视频列表
ipcMain.handle('up:get-videos', async (_, mid: number, maxPage: number = 0) => {
  try {
    const videos = await authManager.fetchAllUpVideos(mid, maxPage);
    return { success: true, videos };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 创建批量任务
ipcMain.handle('batch:create-task', async (_, options: any) => {
  try {
    const task = await downloadEngine.createBatchTask(options);
    return { success: true, task };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 启动批量任务
ipcMain.handle('batch:start-task', async (_, batchId: string) => {
  try {
    await downloadEngine.startBatchTask(batchId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 暂停批量任务
ipcMain.handle('batch:pause-task', async (_, batchId: string) => {
  downloadEngine.pauseBatchTask(batchId);
  return { success: true };
});

// 恢复批量任务
ipcMain.handle('batch:resume-task', async (_, batchId: string) => {
  await downloadEngine.resumeBatchTask(batchId);
  return { success: true };
});

// 获取批量任务
ipcMain.handle('batch:get-task', async (_, batchId: string) => {
  const task = downloadEngine.getBatchTask(batchId);
  if (task) {
    return { success: true, task };
  }
  return { success: false, error: 'Task not found' };
});

// Download events forwarding to renderer
downloadEngine.on('task-created', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-created', task);
  // Save to database
  insertDownload({
    id: task.id,
    bvid: task.bvid,
    aid: task.aid,
    cid: task.cid,
    title: task.title,
    cover: '',
    quality: task.quality,
    file_path: task.outputPath,
    file_size: 0,
    status: task.status,
  });
});

downloadEngine.on('task-started', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-started', task);
});

downloadEngine.on('task-progress', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-progress', task);
});

downloadEngine.on('task-updated', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-updated', task);
});

downloadEngine.on('task-completed', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-completed', task);
  updateDownloadStatus(task.id, task.status, task.completedAt?.toString());
});

downloadEngine.on('task-error', (task: DownloadTask, error: Error) => {
  mainWindow?.webContents.send('download:task-error', task, error.message);
  updateDownloadStatus(task.id, task.status);
});

downloadEngine.on('task-paused', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-paused', task);
});

downloadEngine.on('task-cancelled', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-cancelled', task);
  deleteDownload(task.id);
});

// 批量任务事件转发
downloadEngine.on('batch-task-created', (task: any) => {
  mainWindow?.webContents.send('batch:task-created', task);
});

downloadEngine.on('batch-task-started', (task: any) => {
  mainWindow?.webContents.send('batch:task-started', task);
});

downloadEngine.on('batch-task-progress', (task: any) => {
  mainWindow?.webContents.send('batch:task-progress', task);
});

downloadEngine.on('batch-task-completed', (task: any) => {
  mainWindow?.webContents.send('batch:task-completed', task);
});

downloadEngine.on('batch-task-paused', (task: any) => {
  mainWindow?.webContents.send('batch:task-paused', task);
});

// Export for preload
export { mainWindow };
