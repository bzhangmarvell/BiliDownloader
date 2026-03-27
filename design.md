---
UID: 20260327003250
aliases: []
tags: []
source:
cssclass:
created: 2026-03-27
---

# 📺 BiliDownloader - 哔哩哔哩视频下载器设计规格

---

## 1. 项目概述

| 项目 | 说明 |
|:---|:---|
| **名称** | BiliDownloader |
| **框架** | Electron + React/Vue |
| **目标平台** | Windows / macOS / Linux |
| **核心功能** | 下载B站视频、番剧、课程，支持多清晰度、断点续传 |

---

## 2. 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Main Process                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │  Download   │  │   Storage   │  │    Bilibili     │    │
│  │   Engine    │  │   Manager   │  │       API       │    │
│  │  (ffmpeg)   │  │  (SQLite)   │  │    Client       │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │ IPC
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process (UI)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │   React     │  │    State    │  │     Player      │    │
│  │    Pages    │  │ Management  │  │    Preview      │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 B站API模块

> 📅 记录时间: 15:28

```typescript
// src/main/bilibili/api.ts

interface VideoInfo {
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

interface VideoPage {
  cid: number;
  page: number;
  part: string;      // 分P标题
  duration: number;
}

interface PlayUrl {
  quality: number;   // 清晰度
  format: string;    // mp4/flv
  url: string;
  backupUrl: string[];
  size: number;
  mimeType: string;
}

class BilibiliAPI {
  private cookie: string;

  // 获取视频信息
  async getVideoInfo(bvid: string): Promise<VideoInfo>;

  // 获取播放地址
  async getPlayUrl(cid: number, quality: number): Promise<PlayUrl>;

  // 获取DASH格式
  async getDashInfo(cid: number, quality: number): Promise<DashInfo>;

  // 登录验证
  async loginByQR(): Promise<QrLoginResult>;
  async checkLogin(): Promise<boolean>;
}
```

---

### 3.2 下载引擎

> 📅 记录时间: 15:28

```typescript
// src/main/download/engine.ts

interface DownloadTask {
  id: string;
  bvid: string;
  cid: number;
  title: string;
  quality: number;
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'error';
  progress: number;
  speed: number;
  outputPath: string;
}

class DownloadEngine {
  private ffmpegPath: string;
  private maxConcurrent: number = 3;

  // 创建下载任务
  async createTask(url: string, options: DownloadOptions): Promise<DownloadTask>;

  // DASH格式下载（音视频分离）
  async downloadDash(task: DownloadTask): Promise<void>;

  // FLV格式下载
  async downloadFlv(task: DownloadTask): Promise<void>;

  // 合并音视频
  async mergeAV(videoPath: string, audioPath: string, output: string): Promise<void>;

  // 断点续传
  async resumeTask(taskId: string): Promise<void>;

  // 暂停/取消
  pauseTask(taskId: string): void;
  cancelTask(taskId: string): void;
}
```

---

### 3.3 数据存储

> 📅 记录时间: 15:28

```sql
-- SQLite Schema

-- 下载记录
CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  bvid TEXT NOT NULL,
  cid INTEGER NOT NULL,
  title TEXT,
  cover TEXT,
  quality INTEGER,
  file_path TEXT,
  file_size INTEGER,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 用户信息
CREATE TABLE users (
  mid INTEGER PRIMARY KEY,
  name TEXT,
  face TEXT,
  cookie TEXT,
  vip_status INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 收藏夹缓存
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY,
  title TEXT,
  count INTEGER,
  updated_at DATETIME
);
```

---

## 4. 功能模块

### 4.1 核心功能

| 功能 | 说明 | 优先级 |
|:---|:---|:---:|
| 单视频下载 | 输入BV号/URL下载 | 🔴 P0 |
| 多P视频批量下载 | 支持选择分P | 🔴 P0 |
| 多清晰度选择 | 4K/1080P/720P等 | 🔴 P0 |
| 断点续传 | 网络中断后继续 | 🟠 P1 |
| 批量下载 | 添加多个任务队列 | 🟠 P1 |
| 弹幕下载 | XML/ASS格式 | 🟡 P3 |

---

### 4.2 用户界面

```
┌─────────────────────────────────────────────────────────────┐
│  BiliDownloader                              [—] [□] [×]   │
├─────────────────────────────────────────────────────────────┤
│  [新建下载]  [任务列表]  [设置]  [关于]                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  输入B站视频链接或BV号...                        [解析] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📹 视频标题: xxxxxxxxxxxx                           │   │
│  │  👤 UP主: xxxxx          ⏱ 时长: 12:34              │   │
│  │  ───────────────────────────────────────────────    │   │
│  │  清晰度: [1080P ▼]      格式: [MP4 ▼]                │   │
│  │  下载路径: ~/Downloads/BiliDownloader               │   │
│  │  ───────────────────────────────────────────────    │   │
│  │  [全选]  [取消全选]  [开始下载]                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  下载队列                                                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [████████████░░░░░░░░] 65% | 120MB/s | video1      │   │
│  │  [████████████████████] 100% | 已完成 | video2       │   │
│  │  [░░░░░░░░░░░░░░░░░░░░] 等待中...    | video3       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

> 📅 记录时间: 15:29

---

## 5. 技术要点

### 5.1 B站视频格式处理

> 📅 记录时间: 15:29

> ℹ️ **说明**: B站视频主要有两种格式

```typescript
interface DashInfo {
  video: DashStream[];   // 视频流列表
  audio: DashStream[];   // 音频流列表
}

interface DashStream {
  id: number;
  baseUrl: string;
  backupUrl: string[];
  bandwidth: number;
  mimeType: string;
  codecs: string;
}
```

| 格式 | 说明 | 处理方式 |
|:---|:---|:---|
| **FLV** | 旧格式，低清晰度 | 直接下载单个FLV文件 |
| **DASH** | 新格式，高清 | 音视频分离，需要分别下载后合并 |

> ⚡ **使用 ffmpeg 合并**:
> ```bash
> ffmpeg -i video.m4s -i audio.m4s -c copy output.mp4
> ```

---

### 5.2 认证与Cookie管理

> 📅 记录时间: 15:29

```typescript
class AuthManager {
  // 方式1: 扫码登录
  async getQRCode(): Promise<string>;           // 返回二维码图片URL
  async pollQRStatus(qrKey: string): Promise<LoginResult>;

  // 方式2: 导入Cookie
  async importCookie(cookie: string): Promise<boolean>;

  // Cookie持久化
  saveCookie(cookie: string): void;
  loadCookie(): string | null;

  // 验证登录状态
  async validateCookie(): Promise<boolean>;
}
```

---

### 5.3 下载限速与重试

```typescript
interface DownloadConfig {
  maxConcurrent: number;   // 最大并发数
  chunkSize: number;       // 分块大小
  maxRetries: number;     // 最大重试次数
  retryDelay: number;     // 重试间隔
  speedLimit: number;     // 限速
  proxy: string;          // 代理设置
}

// 断点续传实现
class ChunkDownloader {
  async download(url: string, start: number, end: number): Promise<Buffer>;
  // 使用Range头: Range: bytes=0-1048575
}
```

---

## 6. 项目结构

> 📅 记录时间: 15:29

```
BiliDownloader/
├── package.json
├── electron-builder.json
├── tsconfig.json
│
├── src/
│   ├── main/                          # 主进程
│   │   ├── index.ts
│   │   ├── bilibili/
│   │   │   ├── api.ts                 # B站API封装
│   │   │   ├── auth.ts                # 登录认证
│   │   │   └── types.ts               # 类型定义
│   │   ├── download/
│   │   │   ├── engine.ts              # 下载引擎
│   │   │   ├── dash.ts                # DASH处理
│   │   │   └── merger.ts              # 音视频合并
│   │   ├── storage/
│   │   │   └── database.ts            # SQLite封装
│   │   └── utils/
│   │       ├── ffmpeg.ts              # ffmpeg工具
│   │       └── proxy.ts               # 代理设置
│   │
│   └── renderer/                     # 渲染进程
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Download.tsx
│       │   │   ├── Tasks.tsx
│       │   │   └── Settings.tsx
│       │   ├── components/
│       │   │   ├── VideoCard.tsx
│       │   │   ├── TaskItem.tsx
│       │   │   └── QualitySelect.tsx
│       │   └── store/
│       │       └── downloadStore.ts
│       └── styles/
│
├── resources/
│   └── ffmpeg/                        # 内置ffmpeg
│
└── build/                             # 打包资源
    ├── icon.ico
    └── installer.nsh
```

---

## 7. 依赖库

> 📅 记录时间: 15:29

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "zustand": "^4.4.0",
    "better-sqlite3": "^9.2.0",
    "axios": "^1.6.0",
    "fluent-ffmpeg": "^2.1.0",
    "cheerio": "^1.0.0",
    "crypto-js": "^4.2.0"
  },
  "devDependencies": {
    "electron-builder": "^24.9.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

---

## 8. 安全考虑

| 风险 | 处理方案 |
|:---|:---|
| 🔒 Cookie泄露 | 加密存储，不暴露给渲染进程 |
| ⚠️ API滥用 | 添加请求频率限制，模拟正常用户行为 |
| 💰 付费内容 | 检测VIP状态，不允许未付费下载 |
| 📄 版权风险 | 添加免责声明，仅供个人学习使用 |

---

## 9. 开发里程碑

| 阶段 | 内容 | 周期 |
|:---|:---|:---|
| 🅿️ Phase 1 | 基础框架 + 视频解析 + 单视频下载 | 2周 |
| 🅿️ Phase 2 | 多P下载 + 批量下载 + 断点续传 | 1周 |
| 🅿️ Phase 3 | 登录功能 + 收藏夹同步 | 1周 |
| 🅿️ Phase 4 | 字幕/弹幕下载 + UI优化 | 1周 |
| 🅿️ Phase 5 | 打包发布 + 文档 | 1周 |

---

*📝 文档创建时间: 2026-03-27*
