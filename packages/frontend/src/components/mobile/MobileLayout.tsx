import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileHeader } from './MobileHeader';
import { MobileNavigation } from './MobileNavigation';
import { MobileSidebar } from './MobileSidebar';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

interface MobileLayoutProps {
  children: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  // モバイル画面サイズを検出
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // スクロール位置を監視してヘッダーの表示を制御
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      
      if (Math.abs(scrollY - lastScrollY) < 5) {
        ticking = false;
        return;
      }
      
      setIsScrolled(scrollY > 50);
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ページ変更時にサイドバーを閉じる
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // モバイル用のキーボードショートカット（最小限）
  const mobileShortcuts = [
    {
      key: 'Escape',
      description: 'サイドバーを閉じる',
      action: () => setIsSidebarOpen(false),
    },
  ];

  useKeyboardShortcuts({
    shortcuts: mobileShortcuts,
    enabled: isMobile && isSidebarOpen,
  });

  // デスクトップの場合は通常のレイアウトを使用
  if (!isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* モバイルヘッダー */}
      <MobileHeader
        onMenuClick={() => setIsSidebarOpen(true)}
        isScrolled={isScrolled}
        className={`transition-transform duration-300 ${
          isScrolled ? 'transform -translate-y-full' : 'transform translate-y-0'
        }`}
      />

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex overflow-hidden">
        {/* メインコンテンツ */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 pb-20">
            {children}
          </div>
        </main>

        {/* モバイルサイドバー */}
        <MobileSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      {/* ボトムナビゲーション */}
      <MobileNavigation />

      {/* オーバーレイ */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};