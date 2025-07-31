import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePullToRefresh } from '../../hooks/useTouchGestures';

interface MobilePullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  enabled?: boolean;
}

export const MobilePullToRefresh: React.FC<MobilePullToRefreshProps> = ({
  onRefresh,
  children,
  className = '',
  threshold = 80,
  enabled = true,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      setIsPulling(false);
    }
  };

  const { ref } = usePullToRefresh(handleRefresh, threshold, enabled);

  // プルの進行状況を計算
  const pullProgress = Math.min(pullDistance / threshold, 1);
  const shouldTriggerRefresh = pullDistance >= threshold;
  const rotationAngle = pullProgress * 180;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {/* プルトゥリフレッシュインジケーター */}
      <div
        className={`
          absolute top-0 left-0 right-0 flex items-center justify-center z-10 bg-white dark:bg-gray-800 transition-all duration-300
          ${isPulling || isRefreshing ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          height: `${Math.max(pullDistance, isRefreshing ? 60 : 0)}px`,
          transform: `translateY(${isPulling && !isRefreshing ? pullDistance - threshold : 0}px)`,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            className={`
              flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
              ${shouldTriggerRefresh ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-700'}
              ${isRefreshing ? 'animate-spin' : ''}
            `}
            style={{
              transform: isRefreshing ? 'rotate(360deg)' : `rotate(${rotationAngle}deg)`,
            }}
          >
            <RefreshCw
              className={`
                h-4 w-4 transition-colors duration-300
                ${shouldTriggerRefresh ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}
              `}
            />
          </div>
          
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {isRefreshing 
              ? '更新中...' 
              : shouldTriggerRefresh 
                ? '離して更新' 
                : '引っ張って更新'
            }
          </span>
        </div>
      </div>

      {/* メインコンテンツエリア */}
      <div
        className={`mobile-scroll transition-transform duration-300 ${isRefreshing ? 'pt-16' : ''}`}
        style={{
          transform: isPulling && !isRefreshing ? `translateY(${Math.min(pullDistance, threshold)}px)` : 'translateY(0)',
        }}
      >
        {children}
      </div>

      {/* 更新完了フィードバック */}
      {isRefreshing && (
        <div className="absolute top-4 left-4 right-4 flex items-center justify-center">
          <div className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-3 py-2 rounded-lg text-sm font-medium shadow-sm">
            ✓ 更新完了
          </div>
        </div>
      )}
    </div>
  );
};

// より簡単なバージョン（基本的な機能のみ）
export const SimplePullToRefresh: React.FC<{
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}> = ({ onRefresh, children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const { ref } = usePullToRefresh(handleRefresh, 100, true);

  return (
    <div ref={ref} className="mobile-scroll">
      {isRefreshing && (
        <div className="fixed top-4 left-4 right-4 z-50 flex items-center justify-center">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            更新中...
          </div>
        </div>
      )}
      {children}
    </div>
  );
};