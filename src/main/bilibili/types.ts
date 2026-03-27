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
