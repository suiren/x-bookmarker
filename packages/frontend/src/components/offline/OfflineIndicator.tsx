/**
 * オフライン状態インジケーター
 * @description ネットワーク状態と同期ステータスを表示
 */

import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  X,
  Settings,
  Clock,
  Database
} from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineSync } from '../../hooks/useOfflineBookmarks';
import { syncService, type SyncStatus } from '../../services/syncService';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function OfflineIndicator({ 
  className = '',
  showDetails = false 
}: OfflineIndicatorProps) {
  const networkStatus = useNetworkStatus();
  const { isSyncing, lastSyncTime, syncToOffline, clearOfflineData, canSync } = useOfflineSync();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  // 同期状態の監視
  useEffect(() => {
    const unsubscribe = syncService.onStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  const getStatusIcon = () => {
    if (isSyncing || syncStatus?.isRunning) {
      return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;
    }
    
    if (!networkStatus.isOnline) {
      return <WifiOff className="w-4 h-4 text-red-500" />;
    }
    
    if (networkStatus.isSlowConnection) {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
    
    return <Wifi className="w-4 h-4 text-green-500" />;
  };

  const getStatusText = () => {
    if (isSyncing || syncStatus?.isRunning) {
      return syncStatus?.currentOperation || '同期中...';
    }
    
    if (!networkStatus.isOnline) {
      return 'オフライン';
    }
    
    if (networkStatus.isSlowConnection) {
      return '接続が不安定';
    }
    
    return 'オンライン';
  };

  const getConnectionDetails = () => {
    if (!networkStatus.isOnline) {
      return 'インターネットに接続されていません。オフラインでも閲覧・検索は可能です。';
    }
    
    if (networkStatus.isSlowConnection) {
      return `接続速度: ${networkStatus.downlink?.toFixed(1)}Mbps (${networkStatus.effectiveType})`;
    }
    
    return `接続: ${networkStatus.effectiveType || '高速'} (${networkStatus.downlink?.toFixed(1)}Mbps)`;
  };

  const formatLastSyncTime = (date: Date | null) => {
    if (!date) return '未同期';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'たった今';
    if (diffMinutes < 60) return `${diffMinutes}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    return `${diffDays}日前`;
  };

  // シンプル表示モード
  if (!showDetails) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {getStatusIcon()}
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {getStatusText()}
        </span>
      </div>
    );
  }

  // 詳細表示モード
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            接続状態
          </h3>
        </div>
        <button
          onClick={() => setShowSyncDetails(!showSyncDetails)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* ステータス詳細 */}
      <div className="p-3 space-y-3">
        {/* 接続状態 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            ネットワーク状態
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {getStatusText()}
          </span>
        </div>

        {/* 接続詳細 */}
        <div className="text-xs text-gray-500 dark:text-gray-500">
          {getConnectionDetails()}
        </div>

        {/* 同期状態 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            最終同期
          </span>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-sm text-gray-900 dark:text-gray-100">
              {formatLastSyncTime(lastSyncTime)}
            </span>
          </div>
        </div>

        {/* 同期進捗 */}
        {(isSyncing || syncStatus?.isRunning) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {syncStatus?.currentOperation || '同期中...'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {syncStatus?.progress || 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${syncStatus?.progress || 0}%` }}
              />
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {syncStatus?.error && (
          <div className="flex items-start space-x-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-700 dark:text-red-400">
              <div className="font-medium">同期エラー</div>
              <div className="mt-1">{syncStatus.error.message}</div>
            </div>
          </div>
        )}

        {/* アクションボタン */}
        {showSyncDetails && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
            {/* 手動同期ボタン */}
            <button
              onClick={syncToOffline}
              disabled={!canSync || isSyncing}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '同期中...' : '今すぐ同期'}</span>
            </button>

            {/* オフラインデータクリア */}
            <button
              onClick={clearOfflineData}
              disabled={isSyncing}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Database className="w-4 h-4" />
              <span>オフラインデータをクリア</span>
            </button>
          </div>
        )}
      </div>

      {/* オフライン通知バナー */}
      {!networkStatus.isOnline && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800 p-3">
          <div className="flex items-start space-x-2">
            <WifiOff className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800 dark:text-yellow-400">
              <div className="font-medium">オフラインモード</div>
              <div className="mt-1">
                保存済みのブックマークの閲覧・検索が可能です。
                オンライン復帰時に自動で同期されます。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * フローティング オフライン インジケーター
 */
export function FloatingOfflineIndicator() {
  const networkStatus = useNetworkStatus();
  const [showDetails, setShowDetails] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // オンライン復帰時に表示を復活
  useEffect(() => {
    if (networkStatus.isOnline && dismissed) {
      setDismissed(false);
    }
  }, [networkStatus.isOnline, dismissed]);

  // オンライン時は表示しない（ユーザーが閉じた場合も含む）
  if (networkStatus.isOnline || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {showDetails ? (
        <div className="w-80">
          <OfflineIndicator showDetails className="relative">
            <button
              onClick={() => setShowDetails(false)}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </OfflineIndicator>
        </div>
      ) : (
        <button
          onClick={() => setShowDetails(true)}
          className="flex items-center space-x-2 bg-yellow-500 text-white px-4 py-2 rounded-full shadow-lg hover:bg-yellow-600 transition-colors"
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">オフライン</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="ml-2 p-0.5 hover:bg-yellow-600 rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </button>
      )}
    </div>
  );
}