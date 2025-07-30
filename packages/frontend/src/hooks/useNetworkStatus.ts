/**
 * ネットワーク状態管理hook
 * @description オンライン・オフライン状態の監視とリアルタイム更新
 */

import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType: string | null;
  downlink: number | null;
  effectiveType: string | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlowConnection: false,
    connectionType: null,
    downlink: null,
    effectiveType: null,
  });

  useEffect(() => {
    // 基本的なオンライン・オフライン検出
    const updateOnlineStatus = () => {
      const isOnline = navigator.onLine;
      
      setNetworkStatus(prev => ({
        ...prev,
        isOnline,
      }));
    };

    // Network Information API がサポートされている場合
    const updateConnectionInfo = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        
        setNetworkStatus(prev => ({
          ...prev,
          connectionType: connection?.type || null,
          downlink: connection?.downlink || null,
          effectiveType: connection?.effectiveType || null,
          isSlowConnection: connection?.effectiveType === 'slow-2g' || 
                          connection?.effectiveType === '2g' ||
                          (connection?.downlink && connection.downlink < 0.5),
        }));
      }
    };

    // イベントリスナーを設定
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Network Information API のイベントリスナー
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', updateConnectionInfo);
    }

    // 初期状態を更新
    updateOnlineStatus();
    updateConnectionInfo();

    // クリーンアップ
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        connection?.removeEventListener('change', updateConnectionInfo);
      }
    };
  }, []);

  return networkStatus;
}

/**
 * オンライン状態のみを監視するシンプルなhook
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };    
  }, []);

  return isOnline;
}

/**
 * ネットワーク状態変化時のコールバックhook
 */
export function useNetworkStatusCallback(
  onOnline?: () => void,
  onOffline?: () => void,
  onSlowConnection?: () => void
) {
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    if (networkStatus.isOnline && onOnline) {
      onOnline();
    }
  }, [networkStatus.isOnline, onOnline]);

  useEffect(() => {
    if (!networkStatus.isOnline && onOffline) {
      onOffline();
    }
  }, [networkStatus.isOnline, onOffline]);

  useEffect(() => {
    if (networkStatus.isSlowConnection && onSlowConnection) {
      onSlowConnection();
    }
  }, [networkStatus.isSlowConnection, onSlowConnection]);

  return networkStatus;
}