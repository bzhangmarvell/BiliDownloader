// src/main/download/engine.ts

import { EventEmitter } from 'events';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { bilibiliAPI } from '../bilibili/api';
import { DashInfo, DownloadOptions, BatchDownloadOptions, BatchTask, UpVideo } from '../bilibili/types';
import { ffmpegMerge } from '../utils/ffmpeg';

export interface DownloadTask {
  id: string;
  bvid: string;
  aid: number;
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
  private batchTasks: Map<string, BatchTask> = new Map();
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
    
    const targetPage = options.selectPages?.[0] 
      ? videoInfo.pages.find(p => p.page === options.selectPages![0])
      : undefined;
    
    // Ensure output directory exists
    let outputDir = options.outputPath;
    
    // Expand ~ to home directory
    if (outputDir.startsWith('~')) {
      outputDir = path.join(process.env.HOME || '', outputDir.slice(1));
    }
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const task: DownloadTask = {
      id: `${bvid}_${targetPage?.cid || videoInfo.cid}_${Date.now()}`,
      bvid,
      aid: videoInfo.aid,
      cid: targetPage?.cid || videoInfo.cid,
      title: videoInfo.title,
      quality: options.quality,
      status: 'pending',
      progress: 0,
      speed: 0,
      outputPath: path.join(outputDir, `${videoInfo.title}.mp4`),
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

    const currentCookie = bilibiliAPI.getCookie();
    console.log('[Download] Starting task:', { 
      id: task.id, 
      aid: task.aid, 
      cid: task.cid, 
      quality: task.quality,
      cookieSet: !!currentCookie,
      cookieLength: currentCookie?.length || 0
    });
    
    if (!currentCookie) {
      console.error('[Download] No cookie set! Download will likely fail.');
    }
    
    task.status = 'downloading';
    this.emit('task-started', task);

    try {
      const dashInfo = await bilibiliAPI.getDashInfo(task.aid, task.cid, task.quality);
      
      console.log('[Download] DashInfo received:', {
        videoCount: dashInfo.video.length,
        audioCount: dashInfo.audio.length
      });
      
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
      console.error('[Download] Error:', error.message);
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
    const playUrl = await bilibiliAPI.getPlayUrl(task.aid, task.cid, task.quality);
    await this.downloadFile(playUrl.url, task.outputPath, task, 1.0);
  }

  private async downloadFile(
    url: string,
    outputPath: string,
    task: DownloadTask,
    weight: number
  ): Promise<void> {
    const startTime = Date.now();
    const currentCookie = bilibiliAPI.getCookie();

    // Check if file exists and get its size for resume
    let downloadedBytes = 0;
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      downloadedBytes = stats.size;
      console.log('[Download] File exists, size:', downloadedBytes);
    } else {
      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    let retries = 0;

    while (retries < this.config.maxRetries) {
      try {
        console.log('[Download] downloadFile:', { 
          url: url.substring(0, 80), 
          hasCookie: !!currentCookie,
          downloadedBytes 
        });
        
        // Build headers
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.bilibili.com',
        };
        
        if (currentCookie) {
          headers['Cookie'] = currentCookie;
        }
        
        // Add Range header only if resuming
        if (downloadedBytes > 0) {
          headers['Range'] = `bytes=${downloadedBytes}-`;
        }

        const response = await axios.get(url, {
          responseType: 'stream',
          headers,
        });

        const contentLength = response.headers['content-length'];
        const contentRange = response.headers['content-range'];
        
        // Handle 416 (Range Not Satisfiable) - restart from beginning
        if (response.status === 416) {
          console.log('[Download] 416 error, restarting from beginning');
          downloadedBytes = 0;
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          retries++;
          continue;
        }

        console.log('[Download] Response:', {
          status: response.status,
          contentLength,
          contentRange,
        });

        // Calculate total bytes
        let totalBytes = downloadedBytes;
        if (contentRange) {
          const parts = contentRange.split('/');
          if (parts[1] && parts[1] !== '0') {
            totalBytes = parseInt(parts[1]) + downloadedBytes;
          }
        } else if (contentLength) {
          totalBytes = downloadedBytes + parseInt(contentLength);
        }

        // Open file for writing (append if resuming)
        const writer = fs.createWriteStream(outputPath, { 
          flags: downloadedBytes > 0 ? 'a' : 'w' 
        });

        let lastProgressEmit = 0;

        await new Promise<void>((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            if (elapsed > 0) {
              task.speed = downloadedBytes / elapsed / 1024; // KB/s
            }

            if (totalBytes > 0) {
              const progress = (downloadedBytes / totalBytes) * 100 * weight;
              task.progress = Math.min(progress, 100);
              
              // Emit progress every 500ms
              if (now - lastProgressEmit > 500) {
                this.emit('task-progress', task);
                lastProgressEmit = now;
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

  // ============ 批量下载相关方法 ============

  // 辅助方法：解析时长
  private parseDuration(length: string): number {
    const parts = length.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  // 辅助方法：过滤视频
  private filterVideos(videos: UpVideo[], options: BatchDownloadOptions): UpVideo[] {
    let filtered = videos;
    
    if (options.filterKeyword) {
      const keyword = options.filterKeyword.toLowerCase();
      filtered = filtered.filter(v => v.title.toLowerCase().includes(keyword));
    }
    
    if (options.dateRange) {
      const { start, end } = options.dateRange;
      filtered = filtered.filter(v => {
        if (start && v.created < start) return false;
        if (end && v.created > end) return false;
        return true;
      });
    }
    
    return filtered;
  }

  // 辅助方法：排序视频
  private sortVideos(videos: UpVideo[], sortBy: string): UpVideo[] {
    return [...videos].sort((a, b) => {
      switch (sortBy) {
        case 'created_desc': return b.created - a.created;
        case 'created_asc': return a.created - b.created;
        case 'title_asc': return a.title.localeCompare(b.title, 'zh-CN');
        case 'title_desc': return b.title.localeCompare(a.title, 'zh-CN');
        case 'play_desc': return b.play - a.play;
        case 'play_asc': return a.play - b.play;
        case 'duration_desc': return this.parseDuration(b.length) - this.parseDuration(a.length);
        case 'duration_asc': return this.parseDuration(a.length) - this.parseDuration(b.length);
        default: return b.created - a.created;
      }
    });
  }

  // 创建批量任务
  async createBatchTask(options: BatchDownloadOptions): Promise<BatchTask> {
    const upInfo = await bilibiliAPI.getUpInfo(options.mid);
    const maxPage = options.maxCount ? Math.ceil(options.maxCount / 30) : 0;
    const allVideos = await bilibiliAPI.fetchAllUpVideos(options.mid, maxPage);
    
    let filteredVideos = this.filterVideos(allVideos, options);
    filteredVideos = this.sortVideos(filteredVideos, options.sortBy);
    
    if (options.maxCount && options.maxCount > 0) {
      filteredVideos = filteredVideos.slice(0, options.maxCount);
    }
    
    if (options.selectedVideos && options.selectedVideos.length > 0) {
      const selectedSet = new Set(options.selectedVideos);
      filteredVideos = filteredVideos.filter(v => selectedSet.has(v.bvid));
    }
    
    const batchTask: BatchTask = {
      id: `batch_${options.mid}_${Date.now()}`,
      mid: options.mid,
      upName: upInfo.name,
      upFace: upInfo.face,
      totalVideos: allVideos.length,
      selectedCount: filteredVideos.length,
      downloadedCount: 0,
      failedCount: 0,
      status: 'pending',
      progress: 0,
      tasks: [],
      failedVideos: [],
      createdAt: Date.now(),
    };
    
    for (const video of filteredVideos) {
      const videoInfo = await bilibiliAPI.getVideoInfo(video.bvid);
      let outputDir = options.outputPath;
      if (outputDir.startsWith('~')) {
        outputDir = path.join(process.env.HOME || '', outputDir.slice(1));
      }
      const upFolder = path.join(outputDir, upInfo.name);
      if (!fs.existsSync(upFolder)) {
        fs.mkdirSync(upFolder, { recursive: true });
      }
      
      const task: DownloadTask = {
        id: `${video.bvid}_${videoInfo.cid}_${Date.now()}`,
        bvid: video.bvid,
        aid: video.aid,
        cid: videoInfo.cid,
        title: video.title,
        quality: options.quality,
        status: 'pending',
        progress: 0,
        speed: 0,
        outputPath: path.join(upFolder, `${video.title} [${video.bvid}].mp4`),
        createdAt: Date.now(),
      };
      
      batchTask.tasks.push(task);
      this.tasks.set(task.id, task);
    }
    
    this.batchTasks.set(batchTask.id, batchTask);
    this.emit('batch-task-created', batchTask);
    
    return batchTask;
  }

  // 启动批量任务
  async startBatchTask(batchId: string): Promise<void> {
    const batchTask = this.batchTasks.get(batchId);
    if (!batchTask) throw new Error(`Batch task ${batchId} not found`);
    
    batchTask.status = 'running';
    this.emit('batch-task-started', batchTask);
    
    for (const task of batchTask.tasks) {
      const currentBatchTask = this.batchTasks.get(batchId);
      if (!currentBatchTask || currentBatchTask.status === 'paused' || currentBatchTask.status === 'error') {
        break;
      }
      
      if (task.status === 'completed') {
        batchTask.downloadedCount++;
        continue;
      }
      
      batchTask.currentTask = task.id;
      this.emit('batch-task-progress', batchTask);
      
      try {
        await this.startTask(task.id);
        batchTask.downloadedCount++;
      } catch (error: any) {
        batchTask.failedCount++;
        batchTask.failedVideos.push({ bvid: task.bvid, title: task.title, error: error.message });
      }
      
      batchTask.progress = (batchTask.downloadedCount / batchTask.tasks.length) * 100;
      this.emit('batch-task-progress', batchTask);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    batchTask.status = 'completed';
    batchTask.completedAt = Date.now();
    batchTask.currentTask = undefined;
    this.emit('batch-task-completed', batchTask);
  }

  // 暂停批量任务
  pauseBatchTask(batchId: string): void {
    const batchTask = this.batchTasks.get(batchId);
    if (batchTask && batchTask.status === 'running') {
      batchTask.status = 'paused';
      this.emit('batch-task-paused', batchTask);
    }
  }

  // 恢复批量任务
  async resumeBatchTask(batchId: string): Promise<void> {
    const batchTask = this.batchTasks.get(batchId);
    if (batchTask && batchTask.status === 'paused') {
      batchTask.status = 'running';
      await this.startBatchTask(batchId);
    }
  }

  // 获取批量任务
  getBatchTask(batchId: string): BatchTask | undefined {
    return this.batchTasks.get(batchId);
  }
}

export const downloadEngine = new DownloadEngine();
