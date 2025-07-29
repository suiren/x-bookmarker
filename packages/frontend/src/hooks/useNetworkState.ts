/**
 * ネットワーク状態監視hook
 */

import { useState, useEffect } from 'react';

interface NetworkState {
  isOnline: boolean;
  isOffline: boolean;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean;
}

interface NetworkConnection extends EventTarget {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

declare global {
  interface Navigator {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  }
}

export function useNetworkState(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>(() => {
    // 初期状態を設定
    const connection = getConnection();
    
    return {
      isOnline: navigator.onLine,
      isOffline: !navigator.onLine,
      effectiveType: connection?.effectiveType || null,
      downlink: connection?.downlink || null,
      rtt: connection?.rtt || null,
      saveData: connection?.saveData || false
    };
  });

  useEffect(() => {
    // ネットワーク状態変更ハンドラー
    const updateNetworkState = () => {
      const connection = getConnection();
      
      setNetworkState({
        isOnline: navigator.onLine,
        isOffline: !navigator.onLine,
        effectiveType: connection?.effectiveType || null,
        downlink: connection?.downlink || null,
        rtt: connection?.rtt || null,
        saveData: connection?.saveData || false
      });
    };

    // online/offlineイベントリスナー
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);

    // Connection APIのchangeイベントリスナー
    const connection = getConnection();
    if (connection) {
      connection.addEventListener('change', updateNetworkState);
    }

    // クリーンアップ
    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      
      if (connection) {
        connection.removeEventListener('change', updateNetworkState);
      }
    };
  }, []);

  return networkState;
}

/**
 * Network Connection APIを取得
 */
function getConnection(): NetworkConnection | undefined {
  return (
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection
  );
}

/**
 * 接続品質を判定
 */
export function getConnectionQuality(networkState: NetworkState): 'fast' | 'good' | 'slow' | 'offline' {
  if (networkState.isOffline) {
    return 'offline';
  }

  // Connection APIが利用できない場合は'good'とする
  if (!networkState.effectiveType) {
    return 'good';
  }

  switch (networkState.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'slow';
    case '3g':
      return 'good';
    case '4g':
      return 'fast';
    default:
      return 'good';
  }
}

/**
 * データセーバーモードかどうか判定
 */
export function isDataSaverMode(networkState: NetworkState): boolean {
  return networkState.saveData;
}