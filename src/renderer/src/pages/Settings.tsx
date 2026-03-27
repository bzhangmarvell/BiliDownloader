// src/renderer/src/pages/Settings.tsx

import React, { useState, useEffect } from 'react';
import './Settings.css';

interface SettingsPageProps {
  isLoggedIn: boolean;
  setIsLoggedIn: (loggedIn: boolean) => void;
}

export default function SettingsPage({ isLoggedIn, setIsLoggedIn }: SettingsPageProps) {
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrKey, setQrKey] = useState('');
  const [qrStatus, setQrStatus] = useState('');
  const [cookieInput, setCookieInput] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [speedLimit, setSpeedLimit] = useState(0);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    console.log('[Settings] useEffect: showQRCode=', showQRCode, 'qrKey=', qrKey ? qrKey.substring(0, 10) + '...' : 'none');
    
    // Only start polling if we have a valid qrKey
    if (showQRCode && qrKey && qrKey.length > 5) {
      console.log('[Settings] Starting QR poll interval for key:', qrKey.substring(0, 10) + '...');
      pollInterval = setInterval(async () => {
        console.log('[Settings] Polling QR status...');
        const result = await window.auth.pollQRStatus(qrKey);
        console.log('[Settings] QR poll result:', result);
        if (result.success) {
          console.log('[Settings] QR login successful!');
          setQrStatus('登录成功!');
          setIsLoggedIn(true);
          setShowQRCode(false);
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) {
        console.log('[Settings] Clearing poll interval');
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }, [showQRCode, qrKey, setIsLoggedIn]);

  const handleShowQRCode = async () => {
    setShowQRCode(true);
    setQrStatus('');
    try {
      const result = await window.auth.getQRCode();
      setQrKey(result.qrKey);
      setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.url)}`);
    } catch (err: any) {
      setQrStatus('获取二维码失败: ' + err.message);
    }
  };

  const handleImportCookie = async () => {
    try {
      const success = await window.auth.importCookie(cookieInput);
      if (success) {
        setIsLoggedIn(true);
        setCookieInput('');
        alert('Cookie 导入成功!');
      } else {
        alert('Cookie 无效或已过期');
      }
    } catch (err: any) {
      alert('导入失败: ' + err.message);
    }
  };

  const handleLogout = async () => {
    console.log('[Settings] Logout requested');
    await window.auth.logout();
    console.log('[Settings] Logout completed, updating state');
    setIsLoggedIn(false);
    setShowQRCode(false);
    setQrStatus('');
    console.log('[Settings] State updated, isLoggedIn should be false');
  };

  const handleSaveConfig = async () => {
    await window.download.setConfig({
      maxConcurrent,
      speedLimit,
    });
    alert('设置已保存!');
  };

  return (
    <div className="settings-page">
      <h2>设置</h2>

      <div className="settings-section">
        <h3>账号管理</h3>
        
        {isLoggedIn ? (
          <div className="login-status-section">
            <div className="status-indicator logged-in">
              <span className="status-icon">✓</span>
              <span>已登录 B 站账号</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        ) : (
          <div className="login-options">
            <div className="login-method">
              <h4>扫码登录</h4>
              <button className="qr-btn" onClick={handleShowQRCode}>
                显示二维码
              </button>
              {showQRCode && qrCodeUrl && (
                <div className="qr-code-container">
                  <img src={qrCodeUrl} alt="QR Code" className="qr-code" />
                  <p className="qr-status">{qrStatus || '请使用 B 站 APP 扫码登录'}</p>
                </div>
              )}
            </div>

            <div className="login-method">
              <h4>Cookie 导入</h4>
              <textarea
                className="cookie-input"
                placeholder="粘贴 Cookie 字符串..."
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                rows={4}
              />
              <button className="import-btn" onClick={handleImportCookie}>
                导入 Cookie
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>下载设置</h3>
        
        <div className="setting-item">
          <label>最大并发下载数:</label>
          <input
            type="number"
            min="1"
            max="10"
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
            className="number-input"
          />
        </div>

        <div className="setting-item">
          <label>下载限速 (KB/s, 0=不限速):</label>
          <input
            type="number"
            min="0"
            value={speedLimit}
            onChange={(e) => setSpeedLimit(parseInt(e.target.value) || 0)}
            className="number-input"
          />
        </div>

        <button className="save-btn" onClick={handleSaveConfig}>
          保存设置
        </button>
      </div>

      <div className="settings-section">
        <h3>关于</h3>
        <div className="about-info">
          <p><strong>BiliDownloader</strong> v1.0.0</p>
          <p>哔哩哔哩视频下载工具</p>
          <p className="disclaimer">
            ⚠️ 免责声明：本工具仅供个人学习研究使用，请勿用于商业用途。
            下载内容版权归原作者所有，请在下载后 24 小时内删除。
          </p>
        </div>
      </div>
    </div>
  );
}
