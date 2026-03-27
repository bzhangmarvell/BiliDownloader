// src/main/download/engine.ts

import { EventEmitter } from 'events';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { bilibiliAPI } from '../bilibili/api';
import { DashInfo, DownloadOptions } from '../bilibili/types';
import { ffmpegMerge } from '../utils/ffmpeg';

export interface DownloadTask {
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

interface DownloadConfig {
  maxConcurrent: number;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
  speedLimit: number;
}

export class DownloadEngine extends EventEmitter {
  private tasks: Map<string, DownloadTask> = new Map();
  private activeDownloads: Map<string, any> = new Map();
  private config: DownloadConfig = {
    maxConcurrent: 3,
    chunkSize: 1024 * 1024, // 1MB
    maxRetries: 3,
    retryDelay: 1000,
    speedLimit: 0, // 0 = unlimited
  };

  constructor(config?: Partial<DownloadConfig>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  async createTask(url: string, options: DownloadOptions): Promise<DownloadTask> {
    const bvid = this.extractBvid(url);
    if (!bvid) {
      throw new Error('Invalid Bilibili URL or BV number');
    }

    const videoInfo = await bilibiliAPI.getVideoInfo(bvid);
    
    const task: DownloadTask = {
      id: `${bvid}_${options.selectPages?.[0] || videoInfo.cid}_${Date.now()}`,
      bvid,
      cid: options.selectPages?.[0] ? videoInfo.pages.find(p => p.page === options.selectPages![0])?.cid || videoInfo.cid : videoInfo.cid,
      title: videoInfo.title,
      quality: options.quality,
      status: 'pending',
      progress: 0,
      speed: 0,
      outputPath: path.join(options.outputPath, `${videoInfo.title}.mp4`),
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.emit('task-created', task);
    
    return task;
  }

  private extractBvid(url: string): string | null {
    const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
    if (bvidMatch) {
      return bvidMatch[0];
    }
    if (url.startsWith('BV')) {
      return url;
    }
    return null;
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = 'downloading';
    this.emit('task-started', task);

    try {
      const dashInfo = await bilibiliAPI.getDashInfo(task.cid, task.quality);
      
      if (dashInfo.video.length > 0 && dashInfo.audio.length > 0) {
        await this.downloadDash(task, dashInfo);
      } else {
        await this.downloadFlv(task);
      }

      task.status = 'completed';
      task.completedAt = Date.now();
      task.progress = 100;
      this.emit('task-completed', task);
    } catch (error: any) {
      task.status = 'error';
      task.error = error.message;
      this.emit('task-error', task, error);
    }
  }

  private async downloadDash(task: DownloadTask, dashInfo: DashInfo): Promise<void> {
    const tempDir = path.dirname(task.outputPath);
    const videoPath = path.join(tempDir, `video_${task.id}.m4s`);
    const audioPath = path.join(tempDir, `audio_${task.id}.m4s`);

    task.status = 'downloading';
    
    // Download video stream
    const videoStream = dashInfo.video[0];
    await this.downloadFile(videoStream.baseUrl, videoPath, task, 0.7);

    // Download audio stream
    const audioStream = dashInfo.audio[0];
    await this.downloadFile(audioStream.baseUrl, audioPath, task, 0.3);

    // Merge audio and video
    task.status = 'merging';
    this.emit('task-updated', task);
    
    await ffmpegMerge(videoPath, audioPath, task.outputPath);

    // Cleanup temp files
    fs.unlinkSync(videoPath);
    fs.unlinkSync(audioPath);
  }

  private async downloadFlv(task: DownloadTask): Promise<void> {
    const playUrl = await bilibiliAPI.getPlayUrl(task.cid, task.quality);
    await this.downloadFile(playUrl.url, task.outputPath, task, 1.0);
  }

  private async downloadFile(
    url: string,
    outputPath: string,
    task: DownloadTask,
    weight: number
  ): Promise<void> {
    let retries = 0;
    let downloadedBytes = 0;
    const startTime = Date.now();

    while (retries < this.config.maxRetries) {
      try {
        const response = await axios.get(url, {
          responseType: 'stream',
          headers: {
            Range: `bytes=${downloadedBytes}-`,
          },
        });

        const totalBytes = parseInt(response.headers['content-range']?.split('/')[1] || '0');
        const writer = fs.createWriteStream(outputPath, { flags: downloadedBytes > 0 ? 'a' : 'w' });

        const lastTime = Date.now();

        await new Promise<void>((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            task.speed = downloadedBytes / elapsed / 1024; // KB/s

            if (totalBytes > 0) {
              const progress = (downloadedBytes / totalBytes) * 100 * weight;
              task.progress = Math.min(progress, 100);
              
              // Emit progress every 100ms
              if (now - lastTime > 100) {
                this.emit('task-progress', task);
              }
            }

            writer.write(chunk);
          });

          response.data.on('end', () => {
            writer.end();
            resolve();
          });

          response.data.on('error', reject);
          writer.on('error', reject);
        });

        return; // Success
      } catch (error: any) {
        retries++;
        if (retries >= this.config.maxRetries) {
          throw error;
        }
        await new Promise(r => setTimeout(r, this.config.retryDelay * retries));
      }
    }
  }

  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'downloading') {
      task.status = 'paused';
      const controller = this.activeDownloads.get(taskId);
      if (controller) {
        controller.abort();
      }
      this.emit('task-paused', task);
    }
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.pauseTask(taskId);
      task.status = 'error';
      task.error = 'Cancelled by user';
      
      // Cleanup temp files
      if (fs.existsSync(task.outputPath)) {
        fs.unlinkSync(task.outputPath);
      }
      
      this.tasks.delete(taskId);
      this.emit('task-cancelled', task);
    }
  }

  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  getActiveTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'downloading' || t.status === 'merging'
    );
  }

  setConfig(config: Partial<DownloadConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const downloadEngine = new DownloadEngine();
