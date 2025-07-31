import { useRef, useCallback, useEffect } from 'react';

export interface TouchGestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinch?: (scale: number) => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
}

interface TouchGestureOptions {
  swipeThreshold?: number;
  pinchThreshold?: number;
  longPressDelay?: number;
  tapDelay?: number;
  enabled?: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export const useTouchGestures = (
  handlers: TouchGestureHandlers,
  options: TouchGestureOptions = {}
) => {
  const {
    swipeThreshold = 50,
    pinchThreshold = 0.1,
    longPressDelay = 500,
    tapDelay = 300,
    enabled = true,
  } = options;

  const startTouch = useRef<TouchPoint | null>(null);
  const lastTap = useRef<TouchPoint | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const initialDistance = useRef<number | null>(null);
  const isPinching = useRef(false);

  const calculateDistance = useCallback((touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    const touch = e.touches[0];
    const now = Date.now();
    
    startTouch.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: now,
    };

    // 2本指でのピンチ開始
    if (e.touches.length === 2) {
      isPinching.current = true;
      initialDistance.current = calculateDistance(e.touches[0], e.touches[1]);
      return;
    }

    // 長押し開始
    if (handlers.onLongPress) {
      longPressTimer.current = setTimeout(() => {
        handlers.onLongPress?.();
      }, longPressDelay);
    }
  }, [enabled, handlers.onLongPress, longPressDelay, calculateDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !startTouch.current) return;

    // 長押しタイマーをクリア（移動があった場合）
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // ピンチ処理
    if (e.touches.length === 2 && isPinching.current && initialDistance.current) {
      const currentDistance = calculateDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / initialDistance.current;
      
      if (Math.abs(scale - 1) > pinchThreshold && handlers.onPinch) {
        handlers.onPinch(scale);
      }
      return;
    }

    // スワイプ処理
    const touch = e.touches[0];
    const deltaX = touch.clientX - startTouch.current.x;
    const deltaY = touch.clientY - startTouch.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > swipeThreshold) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX > absY) {
        // 水平スワイプ
        if (deltaX > 0 && handlers.onSwipeRight) {
          handlers.onSwipeRight();
        } else if (deltaX < 0 && handlers.onSwipeLeft) {
          handlers.onSwipeLeft();
        }
      } else {
        // 垂直スワイプ
        if (deltaY > 0 && handlers.onSwipeDown) {
          handlers.onSwipeDown();
        } else if (deltaY < 0 && handlers.onSwipeUp) {
          handlers.onSwipeUp();
        }
      }
      
      startTouch.current = null; // スワイプ後はリセット
    }
  }, [enabled, swipeThreshold, pinchThreshold, calculateDistance, handlers]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    // 長押しタイマーをクリア
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // ピンチ終了
    if (isPinching.current) {
      isPinching.current = false;
      initialDistance.current = null;
      return;
    }

    if (!startTouch.current) return;

    const touch = e.changedTouches[0];
    const now = Date.now();
    const deltaX = touch.clientX - startTouch.current.x;
    const deltaY = touch.clientY - startTouch.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const duration = now - startTouch.current.time;

    // タップ判定（移動距離が小さく、時間が短い）
    if (distance < 10 && duration < 300) {
      // ダブルタップ判定
      if (lastTap.current && 
          now - lastTap.current.time < tapDelay &&
          Math.abs(touch.clientX - lastTap.current.x) < 50 &&
          Math.abs(touch.clientY - lastTap.current.y) < 50) {
        
        if (handlers.onDoubleTap) {
          handlers.onDoubleTap();
          lastTap.current = null; // ダブルタップ後はリセット
        }
      } else {
        // シングルタップ
        lastTap.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: now,
        };

        // ダブルタップの可能性があるので少し待つ
        setTimeout(() => {
          if (lastTap.current && now === lastTap.current.time && handlers.onTap) {
            handlers.onTap();
          }
        }, tapDelay);
      }
    }

    startTouch.current = null;
  }, [enabled, tapDelay, handlers]);

  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    const touchOptions = { passive: false };
    
    element.addEventListener('touchstart', handleTouchStart, touchOptions);
    element.addEventListener('touchmove', handleTouchMove, touchOptions);
    element.addEventListener('touchend', handleTouchEnd, touchOptions);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { ref };
};

// プリセットジェスチャーフック
export const useSwipeGestures = (
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  enabled = true
) => {
  return useTouchGestures(
    { onSwipeLeft, onSwipeRight },
    { enabled, swipeThreshold: 50 }
  );
};

export const usePullToRefresh = (
  onRefresh: () => void,
  threshold = 100,
  enabled = true
) => {
  const isRefreshing = useRef(false);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || window.scrollY !== 0) return;
    startY.current = e.touches[0].clientY;
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || window.scrollY !== 0 || isRefreshing.current) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > threshold) {
      isRefreshing.current = true;
      onRefresh();
      
      // リフレッシュアニメーション（簡易版）
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      // リセット
      setTimeout(() => {
        isRefreshing.current = false;
      }, 1000);
    }
  }, [enabled, threshold, onRefresh]);

  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleTouchStart, handleTouchMove]);

  return { ref };
};