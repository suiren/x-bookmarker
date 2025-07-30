/**
 * オフライン状態表示コンポーネント
 */

import React from 'react';
import { WifiOff, Wifi, Signal, Zap, Clock } from 'lucide-react';
import { useNetworkState, getConnectionQuality, isDataSaverMode } from '../hooks/useNetworkState';
import { clsx } from 'clsx';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = '',
  showDetails = false
}) => {
  const networkState = useNetworkState();
  const connectionQuality = getConnectionQuality(networkState);
  const dataSaver = isDataSaverMode(networkState);

  // オンライン時は詳細表示モードでない限り非表示
  if (networkState.isOnline && !showDetails) {
    return null;
  }

  const getStatusIcon = () => {
    if (networkState.isOffline) {
      return <WifiOff className="w-4 h-4" />;
    }

    switch (connectionQuality) {
      case 'fast':
        return <Zap className="w-4 h-4" />;
      case 'good':
        return <Wifi className="w-4 h-4" />;
      case 'slow':
        return <Signal className="w-4 h-4" />;
      default:
        return <Wifi className="w-4 h-4" />;
    }
  };

  const getStatusColor = () => {
    if (networkState.isOffline) {
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    }

    switch (connectionQuality) {
      case 'fast':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'good':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'slow':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
    }
  };

  const getStatusText = () => {
    if (networkState.isOffline) {
      return 'オフライン';
    }

    switch (connectionQuality) {
      case 'fast':
        return '高速接続';
      case 'good':
        return '通常接続';
      case 'slow':
        return '低速接続';
      default:
        return 'オンライン';
    }
  };

  const getStatusDescription = () => {
    if (networkState.isOffline) {
      return 'キャッシュされたデータを表示しています';
    }

    if (dataSaver) {
      return 'データセーバーモードが有効です';
    }

    if (connectionQuality === 'slow') {
      return '画像の読み込みを最適化しています';
    }

    return '最新のデータを表示しています';
  };

  return (
    <div className={clsx(
      'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors duration-200',
      getStatusColor(),
      className
    )}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span>{getStatusText()}</span>
        
        {dataSaver && (
          <div className="flex items-center gap-1 text-xs opacity-75">
            <Clock className="w-3 h-3" />
            <span>節約</span>
          </div>
        )}
      </div>

      {showDetails && (
        <div className="ml-2 pl-2 border-l border-current/20">
          <div className="text-xs opacity-75">
            {getStatusDescription()}
          </div>
          
          {networkState.isOnline && networkState.effectiveType && (
            <div className="text-xs opacity-60 mt-1">
              {networkState.effectiveType.toUpperCase()}
              {networkState.downlink && (
                <span className="ml-2">
                  {networkState.downlink.toFixed(1)}Mbps
                </span>
              )}
              {networkState.rtt && (
                <span className="ml-2">
                  {networkState.rtt}ms
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * シンプルなオフライン通知バナー
 */
export const OfflineBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const networkState = useNetworkState();

  if (networkState.isOnline) return null;

  return (
    <div className={clsx(
      'w-full bg-red-600 text-white px-4 py-2 text-center text-sm font-medium',
      className
    )}>
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="w-4 h-4" />
        <span>オフラインモード - キャッシュされたデータを表示中</span>
      </div>
    </div>
  );
};