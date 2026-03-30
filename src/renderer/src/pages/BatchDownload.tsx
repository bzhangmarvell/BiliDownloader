// src/renderer/src/pages/BatchDownload.tsx

import React, { useState } from 'react';
import './BatchDownload.css';

interface UpInfo {
  mid: number;
  name: string;
  face: string;
  fans: number;
  videoCount: number;
}

interface UpVideo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  length: string;
  created: number;
  play: number;
  cid?: number;
}

interface BatchTask {
  id: string;
  upName: string;
  totalVideos: number;
  selectedCount: number;
  downloadedCount: number;
  failedCount: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  progress: number;
  currentTask?: string;
  failedVideos: Array<{
    bvid: string;
    title: string;
    error: string;
  }>;
}

type SortBy = 
  | 'created_desc'
  | 'created_asc'
  | 'title_asc'
  | 'title_desc'
  | 'play_desc'
  | 'play_asc'
  | 'duration_desc'
  | 'duration_asc';

const QUALITY_OPTIONS = [
  { value: 120, label: '4K 超清' },
  { value: 116, label: '1080P 高帧率' },
  { value: 112, label: '1080P 高码率' },
  { value: 80, label: '1080P 高清' },
  { value: 74, label: '720P 高帧率' },
  { value: 64, label: '720P 高清' },
  { value: 48, label: '720P 清晰' },
  { value: 32, label: '480P 清晰' },
];

export default function BatchDownloadPage() {
  const [upInput, setUpInput] = useState('');
  const [upInfo, setUpInfo] = useState<UpInfo | null>(null);
  const [loadingUp, setLoadingUp] = useState(false);
  const [videos, setVideos] = useState<UpVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('created_desc');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [maxCount, setMaxCount] = useState(100);
  const [quality, setQuality] = useState(80);
  const [downloadPath, setDownloadPath] = useState('~/Downloads/BiliDownloader');
  const [batchTask, setBatchTask] = useState<BatchTask | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const extractMid = (input: string): number | null => {
    const urlMatch = input.match(/space\.bilibili\.com\/(\d+)/);
    if (urlMatch) return parseInt(urlMatch[1]);
    const uidMatch = input.match(/^\d+$/);
    if (uidMatch) return parseInt(input);
    return null;
  };

  const handleGetUpInfo = async () => {
    const mid = extractMid(upInput);
    if (!mid) {
      alert('请输入有效的 UP 主 UID 或空间链接');
      return;
    }
    setLoadingUp(true);
    try {
      const result = await window.api.invoke('up:get-info', mid);
      if (result.success) {
        setUpInfo(result.info);
        handleGetVideos(mid);
      } else {
        alert('获取 UP 主信息失败：' + result.error);
      }
    } catch (error: any) {
      alert('请求失败：' + error.message);
    } finally {
      setLoadingUp(false);
    }
  };

  const handleGetVideos = async (mid?: number) => {
    const targetMid = mid || upInfo?.mid;
    if (!targetMid) return;
    setLoadingVideos(true);
    try {
      const maxPage = maxCount > 0 ? Math.ceil(maxCount / 30) : 0;
      const result = await window.api.invoke('up:get-videos', targetMid, maxPage);
      if (result.success) {
        setVideos(result.videos);
        setSelectedVideos(new Set(result.videos.map((v: UpVideo) => v.bvid)));
      } else {
        alert('获取视频列表失败：' + result.error);
      }
    } catch (error: any) {
      alert('请求失败：' + error.message);
    } finally {
      setLoadingVideos(false);
    }
  };

  const toggleVideo = (bvid: string) => {
    const newSet = new Set(selectedVideos);
    if (newSet.has(bvid)) newSet.delete(bvid);
    else newSet.add(bvid);
    setSelectedVideos(newSet);
  };

  const handleSelectAll = () => setSelectedVideos(new Set(videos.map(v => v.bvid)));
  const handleDeselectAll = () => setSelectedVideos(new Set());
  const handleInvertSelection = () => {
    const currentSet = new Set(videos.map(v => v.bvid));
    const newSet = new Set<string>();
    videos.forEach(v => {
      if (!selectedVideos.has(v.bvid)) newSet.add(v.bvid);
    });
    setSelectedVideos(newSet);
  };

  const handleApplyFilter = () => {
    let filtered = [...videos];
    if (filterKeyword) {
      const keyword = filterKeyword.toLowerCase();
      filtered = filtered.filter(v => v.title.toLowerCase().includes(keyword));
    }
    if (dateStart) {
      const startTime = new Date(dateStart).getTime() / 1000;
      filtered = filtered.filter(v => v.created >= startTime);
    }
    if (dateEnd) {
      const endTime = new Date(dateEnd).getTime() / 1000 + 86400;
      filtered = filtered.filter(v => v.created <= endTime);
    }
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created_desc': return b.created - a.created;
        case 'created_asc': return a.created - b.created;
        case 'title_asc': return a.title.localeCompare(b.title, 'zh-CN');
        case 'title_desc': return b.title.localeCompare(a.title, 'zh-CN');
        case 'play_desc': return b.play - a.play;
        case 'play_asc': return a.play - b.play;
        case 'duration_desc': {
          const durA = parseDuration(a.length);
          const durB = parseDuration(b.length);
          return durB - durA;
        }
        case 'duration_asc': {
          const durA = parseDuration(a.length);
          const durB = parseDuration(b.length);
          return durA - durB;
        }
        default: return b.created - a.created;
      }
    });
    setVideos(filtered);
  };

  const parseDuration = (length: string): number => {
    const parts = length.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    else if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };

  const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString('zh-CN');
  const formatPlay = (play: number) => play >= 10000 ? (play / 10000).toFixed(1) + '万' : play.toString();

  const handleSelectFolder = async () => {
    const result = await window.fs.selectFolder();
    if (result.success && result.path) setDownloadPath(result.path);
  };

  const handleStartBatch = async () => {
    if (selectedVideos.size === 0) {
      alert('请至少选择一个视频');
      return;
    }
    if (!upInfo) {
      alert('请先获取 UP 主信息');
      return;
    }
    setIsDownloading(true);
    setShowProgress(true);
    try {
      const options = {
        mid: upInfo.mid,
        quality,
        outputPath: downloadPath,
        sortBy,
        filterKeyword: filterKeyword || undefined,
        dateRange: (dateStart || dateEnd) ? {
          start: dateStart ? new Date(dateStart).getTime() : undefined,
          end: dateEnd ? new Date(dateEnd).getTime() : undefined,
        } : undefined,
        maxCount: maxCount > 0 ? maxCount : undefined,
        selectedVideos: Array.from(selectedVideos),
      };
      const createResult = await window.api.invoke('batch:create-task', options);
      if (!createResult.success) throw new Error(createResult.error);
      setBatchTask(createResult.task);
      window.api.on('batch:task-progress', (task: BatchTask) => setBatchTask(task));
      window.api.on('batch:task-completed', (task: BatchTask) => {
        setBatchTask(task);
        setIsDownloading(false);
        alert(`批量下载完成！\n成功：${task.downloadedCount}\n失败：${task.failedCount}`);
      });
      const startResult = await window.api.invoke('batch:start-task', createResult.task.id);
      if (!startResult.success) throw new Error(startResult.error);
    } catch (error: any) {
      alert('启动批量下载失败：' + error.message);
      setIsDownloading(false);
    }
  };

  const handlePauseResume = async () => {
    if (!batchTask) return;
    if (batchTask.status === 'running') {
      await window.api.invoke('batch:pause-task', batchTask.id);
    } else if (batchTask.status === 'paused') {
      await window.api.invoke('batch:resume-task', batchTask.id);
    }
  };

  const handleCancel = () => {
    setShowProgress(false);
    setBatchTask(null);
    setIsDownloading(false);
  };

  return (
    <div className="batch-download-page">
      <div className="up-input-section">
        <h2>批量下载 UP 主视频</h2>
        <div className="input-group">
          <input
            type="text"
            className="up-input"
            placeholder="输入 UP 主 UID 或空间链接"
            value={upInput}
            onChange={(e) => setUpInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleGetUpInfo()}
            disabled={loadingUp || isDownloading}
          />
          <button className="get-info-btn" onClick={handleGetUpInfo} disabled={loadingUp || isDownloading || !upInput.trim()}>
            {loadingUp ? '获取中...' : '获取'}
          </button>
        </div>
      </div>

      {upInfo && (
        <>
          <div className="up-info-card">
            <img src={upInfo.face} alt={upInfo.name} className="up-face" />
            <div className="up-details">
              <h3>{upInfo.name}</h3>
              <p>📺 粉丝：{upInfo.fans >= 10000 ? (upInfo.fans / 10000).toFixed(1) + '万' : upInfo.fans} | 🎬 视频：{upInfo.videoCount} 个</p>
            </div>
          </div>

          <div className="filter-section">
            <h3>筛选与排序</h3>
            <div className="filter-grid">
              <div className="filter-item">
                <label>排序方式:</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  <option value="created_desc">投稿时间 (最新优先)</option>
                  <option value="created_asc">投稿时间 (最旧优先)</option>
                  <option value="title_asc">标题 (A-Z)</option>
                  <option value="title_desc">标题 (Z-A)</option>
                  <option value="play_desc">播放量 (高到低)</option>
                  <option value="play_asc">播放量 (低到高)</option>
                  <option value="duration_desc">时长 (长到短)</option>
                  <option value="duration_asc">时长 (短到长)</option>
                </select>
              </div>
              <div className="filter-item">
                <label>关键词:</label>
                <input type="text" value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} placeholder="过滤标题包含..." />
              </div>
              <div className="filter-item">
                <label>日期范围:</label>
                <div className="date-range">
                  <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
                  <span>至</span>
                  <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
                </div>
              </div>
              <div className="filter-item">
                <label>最多下载:</label>
                <input type="number" value={maxCount} onChange={(e) => setMaxCount(parseInt(e.target.value) || 0)} min="0" placeholder="0=全部" />
              </div>
            </div>
            <div className="filter-actions">
              <button onClick={handleApplyFilter} className="apply-filter-btn">应用筛选</button>
              <button onClick={() => { setFilterKeyword(''); setDateStart(''); setDateEnd(''); setMaxCount(100); handleGetVideos(); }} className="reset-filter-btn">重置</button>
            </div>
          </div>

          <div className="video-list-section">
            <div className="list-header">
              <h3>视频列表 (已选择 {selectedVideos.size}/{videos.length})</h3>
              <div className="selection-actions">
                <button onClick={handleSelectAll}>全选</button>
                <button onClick={handleInvertSelection}>反选</button>
                <button onClick={handleDeselectAll}>取消选择</button>
              </div>
            </div>
            {loadingVideos ? (
              <div className="loading-videos">加载中...</div>
            ) : (
              <div className="video-list">
                {videos.map((video) => (
                  <label key={video.bvid} className="video-item">
                    <input type="checkbox" checked={selectedVideos.has(video.bvid)} onChange={() => toggleVideo(video.bvid)} />
                    <img src={video.cover} alt="" className="video-cover" />
                    <div className="video-info">
                      <div className="video-title">{video.title}</div>
                      <div className="video-meta">📅 {formatDate(video.created)} | ▶ {formatPlay(video.play)} | ⏱ {video.length}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="download-settings">
            <h3>下载设置</h3>
            <div className="settings-grid">
              <div className="setting-item">
                <label>清晰度:</label>
                <select value={quality} onChange={(e) => setQuality(parseInt(e.target.value))}>
                  {QUALITY_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </div>
              <div className="setting-item">
                <label>下载路径:</label>
                <div className="path-input-group">
                  <input type="text" value={downloadPath} readOnly className="path-input" />
                  <button onClick={handleSelectFolder} className="browse-btn">浏览</button>
                </div>
              </div>
            </div>
            <button className="start-batch-btn" onClick={handleStartBatch} disabled={isDownloading || selectedVideos.size === 0}>
              {isDownloading ? '下载中...' : `开始批量下载 (${selectedVideos.size} 个视频)`}
            </button>
          </div>
        </>
      )}

      {showProgress && batchTask && (
        <div className="progress-panel">
          <div className="progress-header">
            <h3>批量下载进度 - {batchTask.upName}</h3>
            <button onClick={handleCancel} className="close-btn">×</button>
          </div>
          <div className="progress-info">
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${batchTask.progress}%` }} />
            </div>
            <div className="progress-text">{batchTask.progress.toFixed(1)}% ({batchTask.downloadedCount}/{batchTask.selectedCount})</div>
          </div>
          {batchTask.currentTask && (<div className="current-task">当前下载：{batchTask.tasks.find(t => t.id === batchTask.currentTask)?.title || '...'}</div>)}
          <div className="stats">
            <div className="stat-item success">✅ 已完成：{batchTask.downloadedCount}</div>
            <div className="stat-item failed">❌ 失败：{batchTask.failedCount}</div>
          </div>
          {batchTask.failedVideos.length > 0 && (
            <div className="failed-list">
              <h4>失败视频:</h4>
              <ul>{batchTask.failedVideos.map((v, i) => (<li key={i}>❌ {v.title}<div className="error-msg">{v.error}</div></li>))}</ul>
            </div>
          )}
          <div className="progress-actions">
            {batchTask.status === 'running' && (<button onClick={handlePauseResume} className="pause-btn">暂停</button>)}
            {batchTask.status === 'paused' && (<button onClick={handlePauseResume} className="resume-btn">恢复</button>)}
            <button onClick={handleCancel} className="close-panel-btn">关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
