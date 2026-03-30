// src/main/bilibili/auth.ts

import { bilibiliAPI } from './api';
import Store from 'electron-store';
import { log } from '../utils/logger';

interface AuthData {
  cookie: string;
  loginTime: number;
  expireTime: number;
}

const store = new Store<AuthData>({ name: 'auth' });

export class AuthManager {
  private static instance: AuthManager;
  private loginStatus: boolean = false;

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async getQRCode(): Promise<{ qrKey: string; url: string }> {
    return await bilibiliAPI.getQRCode();
  }

  async pollQRStatus(qrKey: string): Promise<{ success: boolean; cookie?: string }> {
    log(`[Auth] Polling QR status for key: ${qrKey.substring(0, 10)}...`);
    const result = await bilibiliAPI.pollQRStatus(qrKey);
    const apiCookie = bilibiliAPI.getCookie();
    log(`[Auth] QR poll result: ${JSON.stringify({ success: result.success, apiHasCookie: !!apiCookie })}`);
    
    if (result.success) {
      const cookie = bilibiliAPI.getCookie();
      log(`[Auth] QR login successful, bilibiliAPI.getCookie(): ${cookie ? `${cookie.substring(0, 30)}...` : 'NONE'}`);
      
      if (cookie) {
        await this.saveCookie(cookie);
        log(`[Auth] Cookie saved to store`);
        // 确保 cookie 已设置到 bilibiliAPI
        bilibiliAPI.setCookie(cookie);
        log(`[Auth] Cookie re-set to bilibiliAPI`);
        // Make sure to set loginStatus
        this.loginStatus = true;
        log(`[Auth] loginStatus set to: ${this.loginStatus}`);
      } else {
        log(`[Auth] WARNING: Login success but no cookie!`);
      }
      
      return { success: true, cookie };
    }
    
    return { success: false };
  }

  async importCookie(cookie: string): Promise<boolean> {
    try {
      console.log('[Auth] Importing cookie:', cookie ? `${cookie.substring(0, 20)}...` : 'empty');
      bilibiliAPI.setCookie(cookie);
      const isValid = await bilibiliAPI.checkLogin();
      console.log('[Auth] Cookie import validation:', isValid);
      
      if (isValid) {
        await this.saveCookie(cookie);
        this.loginStatus = true;
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Auth] Cookie import error:', e);
      return false;
    }
  }

  async saveCookie(cookie: string): Promise<void> {
    store.set({
      cookie,
      loginTime: Date.now(),
      expireTime: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  loadCookie(): string | null {
    const data = store.store;
    if (data && data.expireTime && Date.now() < data.expireTime) {
      const cookie = data.cookie;
      console.log('[Auth] Loaded cookie from store:', cookie ? `${cookie.substring(0, 30)}...` : 'none');
      // Also set it in bilibiliAPI
      if (cookie) {
        bilibiliAPI.setCookie(cookie);
      }
      return cookie;
    }
    console.log('[Auth] No valid cookie in store');
    return null;
  }

  async validateCookie(): Promise<boolean> {
    // Only validate if user explicitly requests it (not on app startup)
    const cookie = this.loadCookie();
    console.log('[Auth] validateCookie called, has stored cookie:', !!cookie);
    if (!cookie) {
      this.loginStatus = false;
      return false;
    }
    
    bilibiliAPI.setCookie(cookie);
    const isValid = await bilibiliAPI.checkLogin();
    console.log('[Auth] Cookie validation result:', isValid);
    this.loginStatus = isValid;
    return isValid;
  }

  async logout(): Promise<void> {
    log('[Auth] Logout requested');
    log('[Auth] Store before clear: ' + JSON.stringify({ hasCookie: !!store.get('cookie') }));
    store.clear();
    log('[Auth] Store after clear: ' + JSON.stringify({ hasCookie: !!store.get('cookie') }));
    bilibiliAPI.setCookie('');
    this.loginStatus = false;
    log('[Auth] Logout complete, loginStatus: false');
  }

  isLoggedIn(): boolean {
    return this.loginStatus;
  }

  // ============ 批量下载相关代理方法 ============

  async getUpInfo(mid: number) {
    return await bilibiliAPI.getUpInfo(mid);
  }

  async fetchAllUpVideos(mid: number, maxPage: number = 0) {
    return await bilibiliAPI.fetchAllUpVideos(mid, maxPage);
  }
}

export const authManager = AuthManager.getInstance();
