import { renderHook, act } from '@testing-library/react';
import { useTouchGestures, useSwipeGestures, usePullToRefresh } from '../../hooks/useTouchGestures';

// TouchEventのモック
const createTouchEvent = (type: string, touches: { clientX: number; clientY: number }[]) => {
  const touchList = touches.map((touch, index) => ({
    ...touch,
    identifier: index,
    target: document.createElement('div'),
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
    pageX: touch.clientX,
    pageY: touch.clientY,
    screenX: touch.clientX,
    screenY: touch.clientY,
  }));

  return {
    type,
    touches: touchList,
    changedTouches: touchList,
    targetTouches: touchList,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    bubbles: true,
    cancelable: true,
  } as unknown as TouchEvent;
};

describe('useTouchGestures', () => {
  let mockElement: HTMLElement;
  let mockHandlers: {
    onSwipeLeft: jest.Mock;
    onSwipeRight: jest.Mock;
    onSwipeUp: jest.Mock;
    onSwipeDown: jest.Mock;
    onPinch: jest.Mock;
    onTap: jest.Mock;
    onDoubleTap: jest.Mock;
    onLongPress: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockElement = document.createElement('div');
    mockElement.addEventListener = jest.fn();
    mockElement.removeEventListener = jest.fn();

    mockHandlers = {
      onSwipeLeft: jest.fn(),
      onSwipeRight: jest.fn(),
      onSwipeUp: jest.fn(),
      onSwipeDown: jest.fn(),
      onPinch: jest.fn(),
      onTap: jest.fn(),
      onDoubleTap: jest.fn(),
      onLongPress: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('基本機能', () => {
    it('refコールバックが適切に動作する', () => {
      const { result } = renderHook(() => useTouchGestures(mockHandlers));
      
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'touchstart',
        expect.any(Function),
        { passive: false }
      );
      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'touchmove',
        expect.any(Function),
        { passive: false }
      );
      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'touchend',
        expect.any(Function),
        { passive: false }
      );
    });

    it('enabledがfalseの場合はイベントを処理しない', () => {
      const { result } = renderHook(() => 
        useTouchGestures(mockHandlers, { enabled: false })
      );
      
      let touchStartHandler: Function;
      
      act(() => {
        result.current.ref(mockElement);
        touchStartHandler = (mockElement.addEventListener as jest.Mock).mock.calls
          .find(call => call[0] === 'touchstart')[1];
      });

      const touchEvent = createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]);
      
      act(() => {
        touchStartHandler(touchEvent);
      });

      // ハンドラーが呼ばれないことを確認
      expect(mockHandlers.onLongPress).not.toHaveBeenCalled();
    });
  });

  describe('スワイプジェスチャー', () => {
    let touchStartHandler: Function;
    let touchMoveHandler: Function;
    let touchEndHandler: Function;

    beforeEach(() => {
      const { result } = renderHook(() => useTouchGestures(mockHandlers));
      
      act(() => {
        result.current.ref(mockElement);
        
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
        touchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
        touchEndHandler = calls.find(call => call[0] === 'touchend')[1];
      });
    });

    it('左スワイプを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 100, clientY: 100 }]));
      });

      expect(mockHandlers.onSwipeLeft).toHaveBeenCalled();
    });

    it('右スワイプを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 200, clientY: 100 }]));
      });

      expect(mockHandlers.onSwipeRight).toHaveBeenCalled();
    });

    it('上スワイプを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 100, clientY: 100 }]));
      });

      expect(mockHandlers.onSwipeUp).toHaveBeenCalled();
    });

    it('下スワイプを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 100, clientY: 200 }]));
      });

      expect(mockHandlers.onSwipeDown).toHaveBeenCalled();
    });

    it('閾値未満の移動ではスワイプを検出しない', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 120, clientY: 100 }]));
      });

      expect(mockHandlers.onSwipeLeft).not.toHaveBeenCalled();
      expect(mockHandlers.onSwipeRight).not.toHaveBeenCalled();
    });

    it('カスタム閾値が機能する', () => {
      const { result } = renderHook(() => 
        useTouchGestures(mockHandlers, { swipeThreshold: 100 })
      );
      
      act(() => {
        result.current.ref(mockElement);
        
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        const customTouchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
        const customTouchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
        
        customTouchStartHandler(createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
        customTouchMoveHandler(createTouchEvent('touchmove', [{ clientX: 150, clientY: 100 }]));
      });

      // 50px移動では閾値100に達しない
      expect(mockHandlers.onSwipeLeft).not.toHaveBeenCalled();

      act(() => {
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        const customTouchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
        
        customTouchMoveHandler(createTouchEvent('touchmove', [{ clientX: 90, clientY: 100 }]));
      });

      // 110px移動で閾値を超える
      expect(mockHandlers.onSwipeLeft).toHaveBeenCalled();
    });
  });

  describe('ピンチジェスチャー', () => {
    let touchStartHandler: Function;
    let touchMoveHandler: Function;
    let touchEndHandler: Function;

    beforeEach(() => {
      const { result } = renderHook(() => useTouchGestures(mockHandlers));
      
      act(() => {
        result.current.ref(mockElement);
        
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
        touchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
        touchEndHandler = calls.find(call => call[0] === 'touchend')[1];
      });
    });

    it('ピンチアウトを検出する', () => {
      act(() => {
        // 2本指での開始
        touchStartHandler(createTouchEvent('touchstart', [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 }
        ]));
        
        // 指を広げる
        touchMoveHandler(createTouchEvent('touchmove', [
          { clientX: 50, clientY: 100 },
          { clientX: 250, clientY: 100 }
        ]));
      });

      expect(mockHandlers.onPinch).toHaveBeenCalledWith(expect.any(Number));
      expect(mockHandlers.onPinch).toHaveBeenCalledWith(expect.toBeGreaterThan(1));
    });

    it('ピンチインを検出する', () => {
      act(() => {
        // 2本指での開始
        touchStartHandler(createTouchEvent('touchstart', [
          { clientX: 50, clientY: 100 },
          { clientX: 250, clientY: 100 }
        ]));
        
        // 指を近づける
        touchMoveHandler(createTouchEvent('touchmove', [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 }
        ]));
      });

      expect(mockHandlers.onPinch).toHaveBeenCalledWith(expect.any(Number));
      expect(mockHandlers.onPinch).toHaveBeenCalledWith(expect.toBeLessThan(1));
    });
  });

  describe('タップジェスチャー', () => {
    let touchStartHandler: Function;
    let touchEndHandler: Function;

    beforeEach(() => {
      const { result } = renderHook(() => useTouchGestures(mockHandlers));
      
      act(() => {
        result.current.ref(mockElement);
        
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
        touchEndHandler = calls.find(call => call[0] === 'touchend')[1];
      });
    });

    it('シングルタップを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        touchEndHandler(createTouchEvent('touchend', [{ clientX: 102, clientY: 98 }]));
      });

      act(() => {
        jest.advanceTimersByTime(400); // tapDelay後
      });

      expect(mockHandlers.onTap).toHaveBeenCalled();
    });

    it('ダブルタップを検出する', () => {
      const tapDelay = 300;
      
      // 1回目のタップ
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
        touchEndHandler(createTouchEvent('touchend', [{ clientX: 100, clientY: 100 }]));
      });

      // 2回目のタップ（短時間内）
      act(() => {
        jest.advanceTimersByTime(100);
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 102, clientY: 98 }]));
        touchEndHandler(createTouchEvent('touchend', [{ clientX: 102, clientY: 98 }]));
      });

      expect(mockHandlers.onDoubleTap).toHaveBeenCalled();
      expect(mockHandlers.onTap).not.toHaveBeenCalled();
    });

    it('移動距離が大きい場合はタップと判定しない', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
        touchEndHandler(createTouchEvent('touchend', [{ clientX: 150, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(mockHandlers.onTap).not.toHaveBeenCalled();
    });
  });

  describe('長押しジェスチャー', () => {
    let touchStartHandler: Function;
    let touchMoveHandler: Function;
    let touchEndHandler: Function;

    beforeEach(() => {
      const { result } = renderHook(() => useTouchGestures(mockHandlers));
      
      act(() => {
        result.current.ref(mockElement);
        
        const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
        touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
        touchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
        touchEndHandler = calls.find(call => call[0] === 'touchend')[1];
      });
    });

    it('長押しを検出する', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(600); // longPressDelay後
      });

      expect(mockHandlers.onLongPress).toHaveBeenCalled();
    });

    it('移動があった場合は長押しをキャンセルする', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(300);
        touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 110, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(mockHandlers.onLongPress).not.toHaveBeenCalled();
    });

    it('タッチエンドで長押しをキャンセルする', () => {
      act(() => {
        touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(300);
        touchEndHandler(createTouchEvent('touchend', [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(mockHandlers.onLongPress).not.toHaveBeenCalled();
    });
  });
});

describe('useSwipeGestures', () => {
  it('簡略化されたスワイプジェスチャーが動作する', () => {
    const onSwipeLeft = jest.fn();
    const onSwipeRight = jest.fn();

    const { result } = renderHook(() => useSwipeGestures(onSwipeLeft, onSwipeRight));

    expect(result.current.ref).toBeDefined();
    // 実際のジェスチャー動作は useTouchGestures でテスト済み
  });
});

describe('usePullToRefresh', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    mockElement = document.createElement('div');
    mockElement.addEventListener = jest.fn();
    mockElement.removeEventListener = jest.fn();
    
    // window.scrollY のモック
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 0,
    });

    // navigator.vibrate のモック
    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      value: jest.fn(),
    });
  });

  it('プルトゥリフレッシュが動作する', () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(onRefresh, 100));

    let touchStartHandler: Function;
    let touchMoveHandler: Function;

    act(() => {
      result.current.ref(mockElement);
      
      const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
      touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
      touchMoveHandler = calls.find(call => call[0] === 'touchmove')[1];
    });

    act(() => {
      touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 50 }]));
      touchMoveHandler(createTouchEvent('touchmove', [{ clientX: 100, clientY: 200 }]));
    });

    expect(onRefresh).toHaveBeenCalled();
  });

  it('スクロール位置が0でない場合は動作しない', () => {
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      value: 100, // スクロール済み
    });

    const onRefresh = jest.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh, 100));

    let touchStartHandler: Function;

    act(() => {
      result.current.ref(mockElement);
      
      const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
      touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
    });

    act(() => {
      touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 50 }]));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('enabledがfalseの場合は動作しない', () => {
    const onRefresh = jest.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh, 100, false));

    let touchStartHandler: Function;

    act(() => {
      result.current.ref(mockElement);
      
      const calls = (mockElement.addEventListener as jest.Mock).mock.calls;
      touchStartHandler = calls.find(call => call[0] === 'touchstart')[1];
    });

    act(() => {
      touchStartHandler(createTouchEvent('touchstart', [{ clientX: 100, clientY: 50 }]));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});