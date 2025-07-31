import React, { useState } from 'react';
import { Search, Menu, Bell, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSearchStore } from '../../stores/searchStore';
import { ThemeToggle } from '../ThemeToggle';

interface MobileHeaderProps {
  onMenuClick: () => void;
  isScrolled?: boolean;
  className?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onMenuClick,
  isScrolled = false,
  className = '',
}) => {
  const { user } = useAuthStore();
  const { setIsSearchModalOpen } = useSearchStore();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header 
      className={`sticky top-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* 左側: メニューボタンとロゴ */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="touch-button p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600"
            aria-label="メニューを開く"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <h1 className="text-lg font-bold text-blue-600 dark:text-blue-400 truncate">
            X Bookmarker
          </h1>
        </div>

        {/* 右側: アクションボタン */}
        <div className="flex items-center gap-2">
          {/* 検索ボタン */}
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="touch-button p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600"
            aria-label="検索"
          >
            <Search className="h-6 w-6" />
          </button>

          {/* クイック追加ボタン */}
          <button
            className="touch-button p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600"
            aria-label="クイック追加"
          >
            <Plus className="h-6 w-6" />
          </button>

          {/* 通知ボタン */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="touch-button p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 relative"
              aria-label="通知"
            >
              <Bell className="h-6 w-6" />
              {/* 通知バッジ */}
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></span>
            </button>

            {/* 通知ドロップダウン */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                    通知
                  </h3>
                  <div className="space-y-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      新しい通知はありません
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* テーマ切り替え */}
          <ThemeToggle />

          {/* ユーザーアバター */}
          <button className="touch-button flex-shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.displayName?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* プログレスバー（オプション - ページ読み込み時） */}
      {isScrolled && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 opacity-70"></div>
      )}
    </header>
  );
};