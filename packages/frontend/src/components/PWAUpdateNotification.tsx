/**
 * PWAアップデート通知コンポーネント
 */

import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useServiceWorker } from '../hooks/useServiceWorker';

interface PWAUpdateNotificationProps {
  className?: string;
}

export const PWAUpdateNotification: React.FC<PWAUpdateNotificationProps> = ({
  className = ''
}) => {
  const { isUpdateAvailable, isOfflineReady, skipWaiting } = useServiceWorker();
  const [isVisible, setIsVisible] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    if (isUpdateAvailable || isOfflineReady) {
      setIsVisible(true);
    }
  }, [isUpdateAvailable, isOfflineReady]);

  const handleUpdate = async () => {
    if (!isUpdateAvailable) return;

    try {
      setIsUpdating(true);
      await skipWaiting();
      // Service Workerがリロードを処理するので、ここでは何もしない
    } catch (error) {
      console.error('Failed to update app:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {isUpdateAvailable ? (
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <RefreshCw className="w-5 h-5 text-green-600 dark:text-green-400" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {isUpdateAvailable ? 'アップデート利用可能' : 'オフライン対応完了'}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {isUpdateAvailable 
                ? '新しいバージョンが利用可能です。更新しますか？'
                : 'アプリをオフラインで使用できるようになりました。'
              }
            </p>
            
            <div className="flex gap-2 mt-3">
              {isUpdateAvailable && (
                <button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md transition-colors duration-200 flex items-center gap-1"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      更新中...
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      更新
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={handleDismiss}
                className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200"
              >
                後で
              </button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};