// src/main/bilibili/types.ts

export interface UserInfo {
  mid: number;
  name: string;
  face: string;
}

export interface VideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  description: string;
  cover: string;
  duration: number;
  owner: UserInfo;
  pages: VideoPage[];
  cid: number;
}

export interface PlayUrl {
  quality: number;
  format: string;
  url: string;
  backupUrl: string[];
  size: number;
  mimeType: string;
}

export interface DashStream {
  id: number;
  baseUrl: string;
  backupUrl: string[];
  bandwidth: number;
  mimeType: string;
  codecs: string;
}

export interface DashInfo {
  video: DashStream[];
  audio: DashStream[];
}

export interface DownloadOptions {
  quality: number;
  format: 'mp4' | 'flv';
  outputPath: string;
  selectPages?: number[];
}

export interface QrLoginResult {
  success: boolean;
  url?: string;
  qrcodeKey?: string;
  message?: string;
}

// ============ 批量下载相关类型 ============

// UP 主视频信息
export interface UpVideo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  length: string;
  created: number;
  play: number;
  cid?: number;
}

// UP 主信息
export interface UpInfo {
  mid: number;
  name: string;
  face: string;
  fans: number;
  videoCount: number;
}

// 排序方式
export type SortBy = 
  | 'created_desc'
  | 'created_asc'
  | 'title_asc'
  | 'title_desc'
  | 'play_desc'
  | 'play_asc'
  | 'duration_desc'
  | 'duration_asc';

// 批量下载配置
export interface BatchDownloadOptions {
  mid: number;
  quality: number;
  outputPath: string;
  sortBy: SortBy;
  filterKeyword?: string;
  dateRange?: {
    start?: number;
    end?: number;
  };
  maxCount?: number;
  selectedVideos?: string[];
}

// 批量任务
export interface BatchTask {
  id: string;
  mid: number;
  upName: string;
  upFace: string;
  totalVideos: number;
  selectedCount: number;
  downloadedCount: number;
  failedCount: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  progress: number;
  currentTask?: string;
  tasks: Array<{
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
  }>;
  failedVideos: Array<{
    bvid: string;
    title: string;
    error: string;
  }>;
  createdAt: number;
  completedAt?: number;
}
