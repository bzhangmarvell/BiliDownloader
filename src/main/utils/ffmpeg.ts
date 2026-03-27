// src/main/utils/ffmpeg.ts

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let ffmpegPath: string | null = null;

export function setFfmpegPath(customPath?: string) {
  if (customPath) {
    ffmpegPath = customPath;
    console.log('[FFmpeg] Using custom path:', customPath);
    ffmpeg.setFfmpegPath(customPath);
    return;
  }

  // For packaged app, ffmpeg is in app.asar.unpacked/resources/ffmpeg/
  // For dev mode, ffmpeg is in resources/ffmpeg/
  const isPackaged = app.isPackaged;
  
  let basePath: string;
  if (isPackaged) {
    // Packaged: app.asar.unpacked/resources/ffmpeg
    basePath = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'ffmpeg');
  } else {
    // Dev: resources/ffmpeg
    basePath = path.join(app.getAppPath(), 'resources', 'ffmpeg');
  }
  
  const ffmpegBin = path.join(basePath, 'ffmpeg');
  
  console.log('[FFmpeg] Checking path:', ffmpegBin);
  console.log('[FFmpeg] Packaged:', isPackaged);
  
  if (fs.existsSync(ffmpegBin)) {
    ffmpegPath = ffmpegBin;
    console.log('[FFmpeg] Found at:', ffmpegBin);
    ffmpeg.setFfmpegPath(ffmpegBin);
  } else {
    console.error('[FFmpeg] Not found at:', ffmpegBin);
  }
}

export function getFfmpegPath(): string | null {
  return ffmpegPath;
}

export async function ffmpegMerge(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  // Ensure ffmpeg path is set before using
  if (!ffmpegPath) {
    console.log('[FFmpeg] Initializing ffmpeg path...');
    setFfmpegPath();
  }

  return new Promise((resolve, reject) => {
    console.log('[FFmpeg] Merging video+audio:', { videoPath, audioPath, outputPath });
    console.log('[FFmpeg] Using ffmpeg:', ffmpegPath);

    if (!ffmpegPath) {
      reject(new Error('FFmpeg not found. Please install ffmpeg or set custom path.'));
      return;
    }

    // Verify ffmpeg exists before trying to run
    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error(`FFmpeg not found at: ${ffmpegPath}`));
      return;
    }

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-c copy', '-shortest'])
      .on('start', (commandLine) => {
        console.log('[FFmpeg] Command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log('[FFmpeg] Progress:', (progress.percent || 0).toFixed(1) + '%');
      })
      .on('end', () => {
        console.log('[FFmpeg] Merge completed');
        resolve();
      })
      .on('error', (err) => {
        console.error('[FFmpeg] Error:', err.message);
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
