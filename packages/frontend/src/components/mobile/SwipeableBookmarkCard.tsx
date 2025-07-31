import React, { useState, useRef } from 'react';
import { Trash2, Archive, Heart, Share, ExternalLink } from 'lucide-react';
import { useTouchGestures } from '../../hooks/useTouchGestures';
import { BookmarkCard } from '../BookmarkCard';

interface SwipeableBookmarkCardProps {
  bookmark: any; // BookmarkCard と同じ props
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onFavorite?: (id: string) => void;
  onShare?: (bookmark: any) => void;
  className?: string;
}

export const SwipeableBookmarkCard: React.FC<SwipeableBookmarkCardProps> = ({
  bookmark,
  onDelete,
  onArchive,
  onFavorite,
  onShare,
  className = '',
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);

  const SWIPE_THRESHOLD = 80;
  const MAX_SWIPE = 160;

  const handleTouchStart = (e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    isDragging.current = true;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging.current) return;

    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    // 左スワイプのみ許可（右スワイプでアクションを表示）
    if (diff < 0) {
      const offset = Math.max(diff, -MAX_SWIPE);
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    
    isDragging.current = false;
    const diff = currentX.current - startX.current;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      // スワイプが閾値を超えた場合
      setSwipeOffset(-MAX_SWIPE);
      setIsRevealed(true);
    } else {
      // 閾値未満の場合は元に戻る
      setSwipeOffset(0);
      setIsRevealed(false);
    }
  };

  const resetSwipe = () => {
    setSwipeOffset(0);
    setIsRevealed(false);
  };

  const handleAction = (action: () => void) => {
    action();
    resetSwipe();
  };

  // タッチジェスチャーの設定
  const { ref: gestureRef } = useTouchGestures({
    onSwipeLeft: () => {
      if (!isRevealed) {
        setSwipeOffset(-MAX_SWIPE);
        setIsRevealed(true);
      }
    },
    onSwipeRight: () => {
      if (isRevealed) {
        resetSwipe();
      }
    },
    onTap: () => {
      if (isRevealed) {
        resetSwipe();
      }
    },
  });

  React.useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div 
      ref={(el) => {
        cardRef.current = el;
        gestureRef(el);
      }}
      className={`relative overflow-hidden ${className}`}
    >
      {/* アクションボタン（背景） */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center bg-gray-100 dark:bg-gray-800">
        <div className="flex h-full">
          {/* お気に入り */}
          {onFavorite && (
            <button
              onClick={() => handleAction(() => onFavorite(bookmark.id))}
              className="flex items-center justify-center w-16 h-full bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
              aria-label="お気に入りに追加"
            >
              <Heart className="h-5 w-5" />
            </button>
          )}

          {/* 共有 */}
          {onShare && (
            <button
              onClick={() => handleAction(() => onShare(bookmark))}
              className="flex items-center justify-center w-16 h-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              aria-label="共有"
            >
              <Share className="h-5 w-5" />
            </button>
          )}

          {/* アーカイブ */}
          {onArchive && (
            <button
              onClick={() => handleAction(() => onArchive(bookmark.id))}
              className="flex items-center justify-center w-16 h-full bg-orange-500 hover:bg-orange-600 text-white transition-colors"
              aria-label="アーカイブ"
            >
              <Archive className="h-5 w-5" />
            </button>
          )}

          {/* 削除 */}
          {onDelete && (
            <button
              onClick={() => handleAction(() => onDelete(bookmark.id))}
              className="flex items-center justify-center w-16 h-full bg-red-500 hover:bg-red-600 text-white transition-colors"
              aria-label="削除"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* メインカード */}
      <div
        className={`
          transform transition-transform duration-200 ease-out bg-white dark:bg-gray-800
          ${swipeOffset < 0 ? 'shadow-lg' : ''}
        `}
        style={{
          transform: `translateX(${swipeOffset}px)`,
        }}
      >
        <BookmarkCard bookmark={bookmark} />
        
        {/* タッチガイド */}
        {!isRevealed && (
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
            <div className="flex items-center text-xs">
              <span className="mr-1">←</span>
              <span>スワイプ</span>
            </div>
          </div>
        )}
      </div>

      {/* オーバーレイ（タップして閉じる） */}
      {isRevealed && (
        <div
          className="absolute inset-0 bg-transparent z-10"
          onClick={resetSwipe}
          aria-label="スワイプアクションを閉じる"
        />
      )}
    </div>
  );
};