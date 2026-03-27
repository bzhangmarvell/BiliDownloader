// src/main/index.ts

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { authManager } from './bilibili/auth';
import { downloadEngine, DownloadTask } from './download/engine';
import { DownloadOptions } from './bilibili/types';
import { initDatabase, insertDownload, updateDownloadStatus, getAllDownloads, deleteDownload } from './storage/database';
import { setFfmpegPath } from './utils/ffmpeg';

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
  return await authManager.validateCookie();
});

ipcMain.handle('auth:logout', async () => {
  await authManager.logout();
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

// Download events forwarding to renderer
downloadEngine.on('task-created', (task: DownloadTask) => {
  mainWindow?.webContents.send('download:task-created', task);
  // Save to database
  insertDownload({
    id: task.id,
    bvid: task.bvid,
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

// Export for preload
export { mainWindow };
