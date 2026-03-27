# BiliDownloader - 哔哩哔哩视频下载器

一个基于 Electron + React 的跨平台 B 站视频下载工具。

## ✨ 功能特性

- 📹 **单视频下载** - 支持 BV 号/URL 解析下载
- 📺 **多 P 视频批量下载** - 支持选择分 P 批量下载
- 🎬 **多清晰度选择** - 支持 4K/1080P/720P 等多种清晰度
- 🔄 **断点续传** - 网络中断后可继续下载
- 📥 **批量下载** - 支持多任务队列并发下载
- 🔐 **扫码登录** - 支持 B 站账号登录，下载 VIP 内容
- 💾 **本地存储** - SQLite 数据库记录下载历史

## 🛠 技术栈

- **框架**: Electron 28 + React 18 + TypeScript
- **构建工具**: Vite 5 + electron-builder
- **状态管理**: Zustand
- **数据库**: better-sqlite3
- **视频处理**: fluent-ffmpeg
- **HTTP 客户端**: Axios

## 📦 安装

### 1. 克隆项目

```bash
cd BiliDownloader
```

### 2. 安装依赖

```bash
npm install
```

### 3. 准备 ffmpeg

下载对应平台的 ffmpeg 可执行文件，放入 `resources/ffmpeg/` 目录：

- **Windows**: `ffmpeg.exe`
- **macOS**: `ffmpeg`
- **Linux**: `ffmpeg`

可以从 https://ffmpeg.org/download.html 下载

## 🚀 开发

```bash
# 安装依赖 (Node 22 + Electron 31)
npm install

# 重建 better-sqlite3 以适配 Electron
npm run rebuild

# 开发模式
npm run electron:dev
```

## 📦 构建

```bash
# 构建当前平台
npm run build

# 构建 Windows
npm run dist:win

# 构建 macOS
npm run dist:mac

# 构建 Linux
npm run dist:linux
```

构建产物在 `release/` 目录。

## ⚙️ 环境要求

- **Node.js**: 22.x
- **Electron**: 31.x (已配置)
- **npm**: 10.x

## 📁 项目结构

```
BiliDownloader/
├── package.json              # 项目配置
├── tsconfig.json            # TypeScript 配置
├── vite.config.ts           # Vite 配置
├── electron-builder.json    # 打包配置
│
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.ts         # 主进程入口
│   │   ├── preload.ts       # 预加载脚本
│   │   ├── bilibili/        # B 站 API 模块
│   │   │   ├── api.ts       # API 封装
│   │   │   ├── auth.ts      # 登录认证
│   │   │   └── types.ts     # 类型定义
│   │   ├── download/        # 下载引擎
│   │   │   └── engine.ts    # 下载核心逻辑
│   │   ├── storage/         # 数据存储
│   │   │   └── database.ts  # SQLite 封装
│   │   └── utils/           # 工具函数
│   │       └── ffmpeg.ts    # ffmpeg 工具
│   │
│   └── renderer/            # React 渲染进程
│       ├── index.html
│       └── src/
│           ├── main.tsx     # 渲染进程入口
│           ├── App.tsx      # 主组件
│           ├── pages/       # 页面组件
│           │   ├── Download.tsx
│           │   ├── Tasks.tsx
│           │   └── Settings.tsx
│           ├── components/  # 可复用组件
│           │   ├── VideoCard.tsx
│           │   ├── TaskItem.tsx
│           │   └── QualitySelect.tsx
│           ├── store/       # 状态管理
│           │   └── downloadStore.ts
│           └── styles/      # 样式文件
│
├── resources/
│   └── ffmpeg/              # ffmpeg 可执行文件
│
└── build/                   # 打包资源
    └── icon.png
```

## 🔌 API 说明

### B 站视频格式

B 站视频主要有两种格式：

| 格式 | 说明 | 处理方式 |
|:---|:---|:---|
| **FLV** | 旧格式，低清晰度 | 直接下载单个 FLV 文件 |
| **DASH** | 新格式，高清 | 音视频分离，需要分别下载后合并 |

### 清晰度对照

| 数值 | 清晰度 |
|:---|:---|
| 127 | 8K 超高清 |
| 126 | 杜比视界 |
| 125 | HDR 真彩 |
| 120 | 4K 超清 |
| 116 | 1080P 高帧率 |
| 112 | 1080P 高码率 |
| 80 | 1080P 高清 |
| 74 | 720P 高帧率 |
| 64 | 720P 高清 |
| 48 | 720P 清晰 |
| 32 | 480P 清晰 |
| 16 | 360P 流畅 |

## ⚠️ 注意事项

1. **VIP 内容**: 需要登录 B 站账号才能下载大会员专享内容
2. **版权风险**: 本工具仅供个人学习研究使用，请勿用于商业用途
3. **下载限制**: 请合理控制并发数，避免对 B 站服务器造成压力

## 📝 开发计划

- [ ] 弹幕下载 (XML/ASS 格式)
- [ ] 字幕下载
- [ ] 收藏夹批量下载
- [ ] 用户空间视频批量下载
- [ ] 自动更新功能

## 📄 许可证

MIT License

## 🙏 致谢

- 感谢 B 站提供优质的视频内容
- 使用 ffmpeg 进行音视频处理
- 基于 Electron 构建跨平台应用

---

**免责声明**: 本工具仅供个人学习研究使用，下载内容版权归原作者所有，请在下载后 24 小时内删除。
