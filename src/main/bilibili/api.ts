// src/main/bilibili/api.ts

import axios from 'axios';
import crypto from 'crypto';
import { VideoInfo, VideoPage, PlayUrl, DashInfo, DashStream } from './types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// WBI 签名相关
let imgKey: string = '';
let subKey: string = '';
let mixinKeyEncTab: number[] = [];

// 获取 mixin key 的索引表
function getMixinKeyEncTab(): number[] {
  return [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
  ];
}

// 对 imgKey 和 subKey 进行编码得到 mixinKey
function getMixinKey(orig: string): string {
  return mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);
}

// 为请求参数进行 wbi 签名
function encWbi(params: Record<string, any>): Record<string, any> {
  const mixinKey = getMixinKey(imgKey + subKey);
  const currTime = Math.round(Date.now() / 1000);
  
  params['wts'] = currTime;
  
  // 按照 key 排序
  const sorted = Object.keys(params).sort();
  const query = sorted
    .map(k => {
      const value = params[k];
      // 过滤特殊字符
      const encoded = encodeURIComponent(value)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
      return `${k}=${encoded}`;
    })
    .join('&');
  
  const wbiSign = crypto.createHash('md5').update(query + mixinKey).digest('hex');
  params['w_rid'] = wbiSign;
  
  return params;
}

// 获取 WBI 密钥
async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (imgKey && subKey) {
    return { imgKey, subKey };
  }

  const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (response.data.code === 0) {
    const imgUrl = response.data.data.wbi_img?.img_url || '';
    const subUrl = response.data.data.wbi_img?.sub_url || '';
    
    imgKey = imgUrl.split('/').pop()?.split('.')[0] || '';
    subKey = subUrl.split('/').pop()?.split('.')[0] || '';
    mixinKeyEncTab = getMixinKeyEncTab();
  }

  return { imgKey, subKey };
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

  private async request<T>(url: string, params?: Record<string, any>, useWbi = false): Promise<T> {
    const defaultParams: Record<string, any> = {
      ...params,
    };

    // 如果需要 WBI 签名
    if (useWbi) {
      await getWbiKeys();
      encWbi(defaultParams);
      console.log('[API] WBI signed params:', { ...defaultParams, w_rid: '***' });
    }

    console.log('[API] Request:', url, { params: defaultParams, hasCookie: !!this.cookie });

    const response = await axios.get(url, {
      params: defaultParams,
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': this.cookie,
        'Referer': 'https://www.bilibili.com',
      },
    });

    console.log('[API] Response:', response.data.code, response.data.message || 'OK');

    if (response.data.code !== 0) {
      throw new Error(`API Error: ${response.data.message || response.data.code}`);
    }

    return response.data.data;
  }

  async getVideoInfo(bvid: string): Promise<VideoInfo> {
    const data = await this.request<any>(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid },
      false // 不需要 WBI 签名
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

  async getPlayUrl(aid: number, cid: number, quality: number = 64): Promise<PlayUrl> {
    console.log('[API] getPlayUrl:', { aid, cid, quality });
    
    // 使用旧版 API（不需要 WBI 签名），参数用 avid 而不是 aid
    const response = await axios.get('https://api.bilibili.com/x/player/playurl', {
      params: {
        avid: aid,
        cid: cid,
        qn: quality,
        fnval: 16,
        type: '',
        otype: 'json',
        fnver: 0,
      },
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': this.cookie,
        'Referer': 'https://www.bilibili.com',
      },
    });

    if (response.data.code !== 0) {
      throw new Error(`API Error: ${response.data.message || response.data.code}`);
    }

    const data = response.data.data;
    console.log('[API] getPlayUrl response:', { code: response.data.code, quality: data.quality });

    const video = data.dash?.video?.[0] || data.durl?.[0];
    
    return {
      quality: data.quality || quality,
      format: data.format || 'mp4',
      url: video?.baseUrl || video?.url || '',
      backupUrl: video?.backupUrl || [],
      size: video?.size || 0,
      mimeType: video?.mimeType || 'video/mp4',
    };
  }

  async getDashInfo(aid: number, cid: number, quality: number = 64): Promise<DashInfo> {
    console.log('[API] getDashInfo:', { aid, cid, quality });
    
    // 使用旧版 API（不需要 WBI 签名），参数用 avid 而不是 aid
    const response = await axios.get('https://api.bilibili.com/x/player/playurl', {
      params: {
        avid: aid,
        cid: cid,
        qn: quality,
        fnval: 4048,  // DASH format
        type: '',
        otype: 'json',
        fnver: 0,
      },
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': this.cookie,
        'Referer': 'https://www.bilibili.com',
      },
    });

    if (response.data.code !== 0) {
      throw new Error(`API Error: ${response.data.message || response.data.code}`);
    }

    const data = response.data.data;
    console.log('[API] getDashInfo response:', { code: response.data.code, hasDash: !!data.dash });

    // 如果是 DASH 格式
    if (data.dash) {
      const video: DashStream[] = data.dash?.video?.map((v: any) => ({
        id: v.id,
        baseUrl: v.baseUrl,
        backupUrl: v.backupUrl || [],
        bandwidth: v.bandwidth,
        mimeType: v.mimeType,
        codecs: v.codecs,
      })) || [];

      const audio: DashStream[] = data.dash?.audio?.map((a: any) => ({
        id: a.id,
        baseUrl: a.baseUrl,
        backupUrl: a.backupUrl || [],
        bandwidth: a.bandwidth,
        mimeType: a.mimeType,
        codecs: a.codecs,
      })) || [];

      return { video, audio };
    }
    
    // 如果是 FLV 格式，返回空数组
    return { video: [], audio: [] };
  }

  async getQRCode(): Promise<{ qrKey: string; url: string }> {
    const data = await this.request<any>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
      {},
      false
    );

    return {
      qrKey: data.qrcode_key,
      url: data.url,
    };
  }

  async pollQRStatus(qrKey: string): Promise<{ success: boolean; url?: string }> {
    const response = await axios.get(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
      {
        params: { qrcode_key: qrKey },
        headers: {
          'User-Agent': USER_AGENT,
        },
        withCredentials: true,
      }
    );

    // B 站扫码登录状态码：
    // 0 = 扫码成功并确认登录
    // 86101 = 未扫码
    // 86090 = 已扫码但未确认
    // 86038 = 二维码已过期
    
    console.log('[API] QR poll response code:', response.data.code);
    console.log('[API] QR poll response data:', JSON.stringify(response.data.data));

    // 只有 code=0 且有 refresh_token 才表示真正的登录成功
    if (response.data.code === 0 && response.data.data) {
      const data = response.data.data;
      
      // 检查是否有 refresh_token 或 url，这才是真正的登录成功标志
      const hasRefreshToken = !!data.refresh_token;
      const hasUrl = !!data.url;
      
      console.log('[API] Login check - refresh_token:', hasRefreshToken, 'url:', hasUrl);
      
      // 如果没有 refresh_token 且没有 url，说明不是真正的登录成功
      if (!hasRefreshToken && !hasUrl) {
        console.log('[API] No refresh_token or url, not a real login');
        return { success: false };
      }
      
      console.log('[API] QR scan confirmed, extracting cookie...');
      
      // 方法 1: 从响应头获取 Set-Cookie
      const setCookie = response.headers['set-cookie'];
      console.log('[API] Set-Cookie from poll response:', setCookie?.length || 0, 'cookies');
      
      if (setCookie && setCookie.length > 0) {
        const cookieString = setCookie
          .map((c: string) => c.split(';')[0])
          .join('; ');
        this.setCookie(cookieString);
        console.log('[API] Cookie from poll headers:', cookieString.substring(0, 50) + '...');
      }
      
      // 方法 2: 从重定向 URL 获取 cookie
      if (!this.cookie && data.url) {
        try {
          const redirectResponse = await axios.get(data.url, {
            maxRedirects: 0,
            validateStatus: () => true,
            headers: {
              'User-Agent': USER_AGENT,
            },
            withCredentials: true,
          });
          
          const redirectCookies = redirectResponse.headers['set-cookie'];
          console.log('[API] Set-Cookie from redirect:', redirectCookies?.length || 0, 'cookies');
          
          if (redirectCookies && redirectCookies.length > 0) {
            const cookieString = redirectCookies
              .map((c: string) => c.split(';')[0])
              .join('; ');
            this.setCookie(cookieString);
            console.log('[API] Cookie from redirect:', cookieString.substring(0, 50) + '...');
          }
        } catch (e) {
          console.log('[API] Redirect fetch error:', e);
        }
      }
      
      // 方法 3: 从 nav API 获取 cookie
      if (!this.cookie) {
        try {
          const navResponse = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
              'User-Agent': USER_AGENT,
            },
            withCredentials: true,
          });
          
          const navCookies = navResponse.headers['set-cookie'];
          console.log('[API] Set-Cookie from nav:', navCookies?.length || 0, 'cookies');
          
          if (navCookies && navCookies.length > 0) {
            const cookieString = navCookies
              .map((c: string) => c.split(';')[0])
              .join('; ');
            this.setCookie(cookieString);
            console.log('[API] Cookie from nav:', cookieString.substring(0, 50) + '...');
          }
        } catch (e) {
          console.log('[API] Nav fetch error:', e);
        }
      }
      
      console.log('[API] Final cookie after login:', this.cookie ? `${this.cookie.substring(0, 30)}...` : 'NONE');
      this.isLoggedIn = !!this.cookie;
      return { success: true, url: data.url };
    }

    // 返回其他状态
    const statusMap: Record<number, string> = {
      86101: 'waiting_for_scan',
      86090: 'scanned_not_confirmed', 
      86038: 'expired',
    };
    const status = statusMap[response.data.code] || `unknown_${response.data.code}`;
    console.log('[API] QR status:', status);
    return { success: false };
  }

  async checkLogin(): Promise<boolean> {
    try {
      await this.request<any>(
        'https://api.bilibili.com/x/web-interface/nav',
        {},
        false
      );
      return this.isLoggedIn;
    } catch {
      return false;
    }
  }
}

export const bilibiliAPI = new BilibiliAPI();
