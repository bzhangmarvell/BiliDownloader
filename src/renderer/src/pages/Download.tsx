// src/renderer/src/pages/Download.tsx

import React, { useState } from 'react';
import VideoCard from '../components/VideoCard';
import QualitySelect from '../components/QualitySelect';
import './Download.css';

interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  description: string;
  cover: string;
  duration: number;
  owner: { mid: number; name: string; face: string };
  pages: { cid: number; page: number; part: string; duration: number }[];
  cid: number;
}

interface DownloadTask {
  id: string;
  bvid: string;
  cid: number;
  title: string;
  quality: number;
  status: string;
  progress: number;
  speed: number;
  outputPath: string;
  createdAt: number;
}

interface DownloadPageProps {
  onTaskCreated: (task: DownloadTask) => void;
}

const QUALITY_OPTIONS = [
  { value: 127, label: '8K 超高清' },
  { value: 126, label: '杜比视界' },
  { value: 125, label: 'HDR 真彩' },
  { value: 120, label: '4K 超清' },
  { value: 116, label: '1080P 高帧率' },
  { value: 112, label: '1080P 高码率' },
  { value: 80, label: '1080P 高清' },
  { value: 74, label: '720P 高帧率' },
  { value: 64, label: '720P 高清' },
  { value: 48, label: '720P 清晰' },
  { value: 32, label: '480P 清晰' },
  { value: 16, label: '360P 流畅' },
];

export default function DownloadPage({ onTaskCreated }: DownloadPageProps) {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedQuality, setSelectedQuality] = useState(80);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [downloadPath, setDownloadPath] = useState('~/Downloads/BiliDownloader');
  const [downloading, setDownloading] = useState(false);

  const parseUrl = async () => {
    if (!url.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Extract BV number from URL
      const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
      const bvid = bvidMatch ? bvidMatch[0] : url;
      
      // In real implementation, this would call the API through IPC
      // For now, we'll simulate the response
      const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(data.message || 'Failed to fetch video info');
      }
      
      setVideoInfo(data.data);
      setSelectedPages([data.data.cid]);
    } catch (err: any) {
      setError(err.message || 'Failed to parse video URL');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = (cid: number) => {
    setSelectedPages(prev => 
      prev.includes(cid) 
        ? prev.filter(c => c !== cid)
        : [...prev, cid]
    );
  };

  const handleSelectAll = () => {
    if (videoInfo) {
      setSelectedPages(videoInfo.pages.map(p => p.cid));
    }
  };

  const handleDeselectAll = () => {
    setSelectedPages([]);
  };

  const handleSelectFolder = async () => {
    const result = await window.fs.selectFolder();
    if (result.success && result.path) {
      setDownloadPath(result.path);
    }
  };

  const handleDownload = async () => {
    if (!videoInfo || selectedPages.length === 0) return;
    
    setDownloading(true);
    
    try {
      for (const cid of selectedPages) {
        const page = videoInfo.pages.find(p => p.cid === cid);
        const taskResult = await window.download.createTask(url, {
          quality: selectedQuality,
          format: 'mp4',
          outputPath: downloadPath,
          selectPages: [page?.page],
        });
        
        if (taskResult.success && taskResult.task) {
          onTaskCreated(taskResult.task);
          await window.download.startTask(taskResult.task.id);
        }
      }
      
      // Reset form
      setUrl('');
      setVideoInfo(null);
      setSelectedPages([]);
    } catch (err: any) {
      setError(err.message || 'Failed to start download');
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="download-page">
      <div className="url-input-section">
        <div className="input-group">
          <input
            type="text"
            className="url-input"
            placeholder="输入 B 站视频链接或 BV 号..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && parseUrl()}
            disabled={loading || downloading}
          />
          <button 
            className="parse-btn"
            onClick={parseUrl}
            disabled={loading || downloading || !url.trim()}
          >
            {loading ? '解析中...' : '解析'}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>

      {videoInfo && (
        <div className="video-info-section">
          <VideoCard video={videoInfo} />
          
          <div className="download-options">
            <div className="option-row">
              <label>清晰度:</label>
              <QualitySelect
                value={selectedQuality}
                onChange={setSelectedQuality}
                options={QUALITY_OPTIONS}
              />
            </div>
            
            <div className="option-row">
              <label>下载路径:</label>
              <div className="path-input-group">
                <input
                  type="text"
                  value={downloadPath}
                  readOnly
                  className="path-input"
                />
                <button onClick={handleSelectFolder} className="browse-btn">
                  浏览
                </button>
              </div>
            </div>

            {videoInfo.pages.length > 1 && (
              <div className="pages-section">
                <div className="pages-header">
                  <span>选择分P ({selectedPages.length}/{videoInfo.pages.length}):</span>
                  <div className="page-actions">
                    <button onClick={handleSelectAll} className="select-all-btn">全选</button>
                    <button onClick={handleDeselectAll} className="deselect-all-btn">取消全选</button>
                  </div>
                </div>
                <div className="pages-list">
                  {videoInfo.pages.map((page) => (
                    <label key={page.cid} className="page-item">
                      <input
                        type="checkbox"
                        checked={selectedPages.includes(page.cid)}
                        onChange={() => handleSelectPage(page.cid)}
                      />
                      <span className="page-title">
                        P{page.page} - {page.part || `P${page.page}`}
                      </span>
                      <span className="page-duration">{formatDuration(page.duration)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button 
              className="download-btn"
              onClick={handleDownload}
              disabled={downloading || selectedPages.length === 0}
            >
              {downloading ? '下载中...' : `开始下载 (${selectedPages.length} P)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
