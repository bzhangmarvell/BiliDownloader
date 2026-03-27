// src/main/utils/ffmpeg.ts

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { app } from 'electron';

let ffmpegPath: string | null = null;

export function setFfmpegPath(customPath?: string) {
  if (customPath) {
    ffmpegPath = customPath;
    ffmpeg.setFfmpegPath(customPath);
  } else {
    // Try to find ffmpeg in resources
    const resourcePath = path.join(app.getAppPath(), 'resources', 'ffmpeg');
    const platform = process.platform;
    const binaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    ffmpegPath = path.join(resourcePath, binaryName);
    if (require('fs').existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
  }
}

export function getFfmpegPath(): string | null {
  return ffmpegPath;
}

export function ffmpegMerge(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-c copy', '-shortest'])
      .on('start', (commandLine) => {
        console.log('FFmpeg started:', commandLine);
      })
      .on('progress', (progress) => {
        console.log('FFmpeg progress:', progress.percent || 0 + '%');
      })
      .on('end', () => {
        console.log('FFmpeg completed');
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

export function getVideoInfo(filePath: string): Promise<{
  duration: number;
  size: { width: number; height: number };
  bitrate: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        duration: metadata.format.duration || 0,
        size: {
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
        },
        bitrate: metadata.format.bit_rate ? Number(metadata.format.bit_rate) : 0,
      });
    });
  });
}
