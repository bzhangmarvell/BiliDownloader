// src/renderer/src/components/VideoCard.tsx

import React from 'react';
import './VideoCard.css';

interface VideoCardProps {
  video: {
    title: string;
    cover: string;
    duration: number;
    owner: {
      name: string;
      face: string;
    };
    description: string;
    pages: { cid: number; page: number; part: string }[];
  };
}

export default function VideoCard({ video }: VideoCardProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-card">
      <div className="video-cover">
        <img src={video.cover} alt={video.title} />
        <div className="duration-badge">{formatDuration(video.duration)}</div>
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <div className="video-meta">
          <img src={video.owner.face} alt={video.owner.name} className="owner-face" />
          <span className="owner-name">{video.owner.name}</span>
        </div>
        {video.description && (
          <p className="video-description">
            {video.description.length > 100 
              ? video.description.substring(0, 100) + '...' 
              : video.description}
          </p>
        )}
        {video.pages.length > 1 && (
          <div className="video-pages">
            <span className="pages-count">共 {video.pages.length} P</span>
          </div>
        )}
      </div>
    </div>
  );
}
