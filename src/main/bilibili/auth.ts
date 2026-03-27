// src/main/bilibili/auth.ts

import { bilibiliAPI } from './api';
import Store from 'electron-store';

interface AuthData {
  cookie: string;
  loginTime: number;
  expireTime: number;
}

const store = new Store<AuthData>({ name: 'auth' });

export class AuthManager {
  private static instance: AuthManager;

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
    const result = await bilibiliAPI.pollQRStatus(qrKey);
    
    if (result.success) {
      // In real implementation, cookie comes from response
      const cookie = bilibiliAPI.getCookie();
      await this.saveCookie(cookie);
      return { success: true, cookie };
    }
    
    return { success: false };
  }

  async importCookie(cookie: string): Promise<boolean> {
    try {
      bilibiliAPI.setCookie(cookie);
      const isValid = await bilibiliAPI.checkLogin();
      
      if (isValid) {
        await this.saveCookie(cookie);
        return true;
      }
      return false;
    } catch {
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
      return data.cookie;
    }
    return null;
  }

  async validateCookie(): Promise<boolean> {
    const cookie = this.loadCookie();
    if (!cookie) return false;
    
    bilibiliAPI.setCookie(cookie);
    return await bilibiliAPI.checkLogin();
  }

  async logout(): Promise<void> {
    store.clear();
    bilibiliAPI.setCookie('');
  }

  isLoggedIn(): boolean {
    return bilibiliAPI.getCookie() !== '';
  }
}

export const authManager = AuthManager.getInstance();
