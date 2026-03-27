// src/main/bilibili/api.ts

import axios from 'axios';
import crypto from 'crypto';
import { VideoInfo, VideoPage, PlayUrl, DashInfo, DashStream } from './types';

const APPKEY = 'bca7e85bc269efc0';
const APPSEC = 'fe09215bdbf96b865b0e97207531d9b2';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function getSign(params: Record<string, any>): string {
  const sorted = Object.keys(params).sort();
  const query = sorted.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('md5').update(query + APPSEC).digest('hex');
}

export class BilibiliAPI {
  private cookie: string = '';
  private isLoggedIn: boolean = false;

  setCookie(cookie: string) {
    this.cookie = cookie;
    this.isLoggedIn = true;
  }

  getCookie(): string {
    return this.cookie;
  }

  private async request<T>(url: string, params?: Record<string, any>): Promise<T> {
    const defaultParams: Record<string, any> = {
      appkey: APPKEY,
      ...params,
    };
    defaultParams['sign'] = getSign(defaultParams);

    const response = await axios.get(url, {
      params: defaultParams,
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: this.cookie,
      },
    });

    if (response.data.code !== 0) {
      throw new Error(`API Error: ${response.data.message || response.data.code}`);
    }

    return response.data.data;
  }

  async getVideoInfo(bvid: string): Promise<VideoInfo> {
    const data = await this.request<any>(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid }
    );

    const pages: VideoPage[] = data.pages.map((p: any) => ({
      cid: p.cid,
      page: p.page,
      part: p.part,
      duration: p.duration,
    }));

    return {
      bvid: data.bvid,
      aid: data.aid,
      title: data.title,
      description: data.desc,
      cover: data.pic,
      duration: data.duration,
      owner: {
        mid: data.owner.mid,
        name: data.owner.name,
        face: data.owner.face,
      },
      pages,
      cid: data.cid,
    };
  }

  async getPlayUrl(cid: number, quality: number = 64): Promise<PlayUrl> {
    const data = await this.request<any>(
      'https://api.bilibili.com/x/player/playurl',
      { cid, qn: quality, fnval: 16 }
    );

    const video = data.dash.video?.[0] || data.durl?.[0];
    
    return {
      quality: data.quality || quality,
      format: data.format || 'mp4',
      url: video?.baseUrl || video?.url || '',
      backupUrl: video?.backupUrl || [],
      size: video?.size || 0,
      mimeType: video?.mimeType || 'video/mp4',
    };
  }

  async getDashInfo(cid: number, quality: number = 64): Promise<DashInfo> {
    const data = await this.request<any>(
      'https://api.bilibili.com/x/player/playurl',
      { cid, qn: quality, fnval: 4048 }
    );

    const video: DashStream[] = data.dash.video.map((v: any) => ({
      id: v.id,
      baseUrl: v.baseUrl,
      backupUrl: v.backupUrl || [],
      bandwidth: v.bandwidth,
      mimeType: v.mimeType,
      codecs: v.codecs,
    }));

    const audio: DashStream[] = data.dash.audio.map((a: any) => ({
      id: a.id,
      baseUrl: a.baseUrl,
      backupUrl: a.backupUrl || [],
      bandwidth: a.bandwidth,
      mimeType: a.mimeType,
      codecs: a.codecs,
    }));

    return { video, audio };
  }

  async getQRCode(): Promise<{ qrKey: string; url: string }> {
    const data = await this.request<any>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
    );

    return {
      qrKey: data.qrcode_key,
      url: data.url,
    };
  }

  async pollQRStatus(qrKey: string): Promise<{ success: boolean; url?: string }> {
    const data = await this.request<any>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
      { qrcode_key: qrKey }
    );

    if (data.code === 0) {
      this.cookie = data.url ? '' : ''; // Cookie will be set from response headers in real impl
      this.isLoggedIn = true;
      return { success: true };
    }

    return { success: false };
  }

  async checkLogin(): Promise<boolean> {
    try {
      await this.request<any>(
        'https://api.bilibili.com/x/web-interface/nav'
      );
      return this.isLoggedIn;
    } catch {
      return false;
    }
  }
}

export const bilibiliAPI = new BilibiliAPI();
