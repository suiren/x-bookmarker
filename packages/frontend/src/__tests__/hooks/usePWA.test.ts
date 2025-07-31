import { renderHook, act, waitFor } from '@testing-library/react';
import { usePWA } from '../../hooks/usePWA';

// ServiceWorkerのモック
const mockServiceWorkerRegistration = {
  installing: null,
  waiting: null,
  active: {
    postMessage: jest.fn(),
  },
  addEventListener: jest.fn(),
  showNotification: jest.fn().mockResolvedValue(undefined),
};

// BeforeInstallPromptEventのモック
const mockBeforeInstallPromptEvent = {
  preventDefault: jest.fn(),
  prompt: jest.fn().mockResolvedValue(undefined),
  userChoice: Promise.resolve({ outcome: 'accepted' as const }),
};

describe('usePWA', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // ServiceWorkerのモック
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      value: {
        register: jest.fn().mockResolvedValue(mockServiceWorkerRegistration),
        controller: null,
      },
    });

    // Notificationのモック
    Object.defineProperty(window, 'Notification', {
      writable: true,
      value: {
        permission: 'default',
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
    });

    // matchMediaのモック
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    // navigatorのモック
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });

    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => usePWA());

      expect(result.current.isInstallable).toBe(false);
      expect(result.current.isInstalled).toBe(false);
      expect(result.current.isStandalone).toBe(false);
      expect(result.current.notificationPermission).toBe('default');
      expect(result.current.isNotificationSupported).toBe(true);
      expect(result.current.isOnline).toBe(true);
    });

    it('スタンドアロンモードを検出する', () => {
      // スタンドアロンモードのモック
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query.includes('display-mode: standalone'),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const { result } = renderHook(() => usePWA());

      expect(result.current.isStandalone).toBe(true);
      expect(result.current.isInstalled).toBe(true);
    });

    it('Service Workerが登録される', async () => {
      renderHook(() => usePWA());

      await waitFor(() => {
        expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
          scope: '/',
        });
      });
    });
  });

  describe('PWAインストール', () => {
    it('beforeinstallpromptイベントを処理する', () => {
      const { result } = renderHook(() => usePWA());

      act(() => {
        const event = new Event('beforeinstallprompt') as any;
        Object.assign(event, mockBeforeInstallPromptEvent);
        window.dispatchEvent(event);
      });

      expect(result.current.isInstallable).toBe(true);
    });

    it('PWAインストールが成功する', async () => {
      const { result } = renderHook(() => usePWA());

      // beforeinstallpromptイベントを発火
      act(() => {
        const event = new Event('beforeinstallprompt') as any;
        Object.assign(event, mockBeforeInstallPromptEvent);
        window.dispatchEvent(event);
      });

      let installResult: boolean;
      await act(async () => {
        installResult = await result.current.installPWA();
      });

      expect(installResult!).toBe(true);
      expect(mockBeforeInstallPromptEvent.prompt).toHaveBeenCalled();
      expect(result.current.isInstallable).toBe(false);
    });

    it('PWAインストールが拒否される', async () => {
      const rejectedEvent = {
        ...mockBeforeInstallPromptEvent,
        userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
      };

      const { result } = renderHook(() => usePWA());

      act(() => {
        const event = new Event('beforeinstallprompt') as any;
        Object.assign(event, rejectedEvent);
        window.dispatchEvent(event);
      });

      let installResult: boolean;
      await act(async () => {
        installResult = await result.current.installPWA();
      });

      expect(installResult!).toBe(false);
    });

    it('appinstalledイベントを処理する', () => {
      const { result } = renderHook(() => usePWA());

      act(() => {
        window.dispatchEvent(new Event('appinstalled'));
      });

      expect(result.current.isInstalled).toBe(true);
      expect(result.current.isInstallable).toBe(false);
    });
  });

  describe('通知機能', () => {
    it('通知許可を要求する', async () => {
      const { result } = renderHook(() => usePWA());

      let permissionResult: boolean;
      await act(async () => {
        permissionResult = await result.current.requestNotificationPermission();
      });

      expect(permissionResult!).toBe(true);
      expect(Notification.requestPermission).toHaveBeenCalled();
      expect(result.current.notificationPermission).toBe('granted');
    });

    it('通知を送信する', async () => {
      // 通知許可済みの状態をモック
      Object.defineProperty(window, 'Notification', {
        writable: true,
        value: {
          permission: 'granted',
          requestPermission: jest.fn().mockResolvedValue('granted'),
        },
      });

      const { result } = renderHook(() => usePWA());

      // Service Worker登録を待つ
      await waitFor(() => {
        expect(result.current.isServiceWorkerRegistered).toBe(true);
      });

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.sendNotification('Test Title', {
          body: 'Test Body',
        });
      });

      expect(sendResult!).toBe(true);
      expect(mockServiceWorkerRegistration.showNotification).toHaveBeenCalledWith(
        'Test Title',
        expect.objectContaining({
          body: 'Test Body',
          icon: '/pwa-192x192.svg',
          badge: '/masked-icon.svg',
        })
      );
    });

    it('通知許可がない場合は送信しない', async () => {
      const { result } = renderHook(() => usePWA());

      let sendResult: boolean;
      await act(async () => {
        sendResult = await result.current.sendNotification('Test Title');
      });

      expect(sendResult!).toBe(false);
      expect(mockServiceWorkerRegistration.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('Service Workerアップデート', () => {
    it('アップデートを検出する', async () => {
      const { result } = renderHook(() => usePWA());

      // Service Worker登録を待つ
      await waitFor(() => {
        expect(result.current.isServiceWorkerRegistered).toBe(true);
      });

      // updatefoundイベントをシミュレート
      act(() => {
        const updateFoundCallback = mockServiceWorkerRegistration.addEventListener.mock.calls
          .find(call => call[0] === 'updatefound')[1];
        
        if (updateFoundCallback) {
          mockServiceWorkerRegistration.installing = {
            addEventListener: jest.fn((event, callback) => {
              if (event === 'statechange') {
                setTimeout(() => {
                  (mockServiceWorkerRegistration.installing as any).state = 'installed';
                  navigator.serviceWorker.controller = {} as any;
                  callback();
                }, 0);
              }
            }),
          };
          
          updateFoundCallback();
        }
      });

      await waitFor(() => {
        expect(result.current.isUpdateAvailable).toBe(true);
      });
    });

    it('Service Workerアップデートを適用する', () => {
      const mockWaitingWorker = {
        postMessage: jest.fn(),
      };

      const reloadSpy = jest.spyOn(window.location, 'reload').mockImplementation(() => {});

      const { result } = renderHook(() => usePWA());

      // アップデート可能な状態をモック
      act(() => {
        (result.current as any).serviceWorkerState = {
          registration: {
            waiting: mockWaitingWorker,
          },
        };
      });

      act(() => {
        result.current.applyServiceWorkerUpdate();
      });

      expect(mockWaitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(reloadSpy).toHaveBeenCalled();

      reloadSpy.mockRestore();
    });
  });

  describe('オフライン/オンライン検出', () => {
    it('オンライン状態の変化を検出する', () => {
      const { result } = renderHook(() => usePWA());

      expect(result.current.isOnline).toBe(true);

      act(() => {
        Object.defineProperty(navigator, 'onLine', {
          writable: true,
          value: false,
        });
        window.dispatchEvent(new Event('offline'));
      });

      expect(result.current.isOnline).toBe(false);

      act(() => {
        Object.defineProperty(navigator, 'onLine', {
          writable: true,
          value: true,
        });
        window.dispatchEvent(new Event('online'));
      });

      expect(result.current.isOnline).toBe(true);
    });
  });

  describe('コンテンツ共有', () => {
    it('Web Share APIを使用してコンテンツを共有する', async () => {
      const { result } = renderHook(() => usePWA());

      const shareData = {
        title: 'Test Title',
        text: 'Test Text',
        url: 'https://example.com',
      };

      let shareResult: boolean;
      await act(async () => {
        shareResult = await result.current.shareContent(shareData);
      });

      expect(shareResult!).toBe(true);
      expect(navigator.share).toHaveBeenCalledWith(shareData);
    });

    it('Web Share APIが使えない場合はクリップボードを使用する', async () => {
      // Web Share APIを無効化
      Object.defineProperty(navigator, 'share', {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => usePWA());

      const shareData = {
        title: 'Test Title',
        text: 'Test Text',
        url: 'https://example.com',
      };

      let shareResult: boolean;
      await act(async () => {
        shareResult = await result.current.shareContent(shareData);
      });

      expect(shareResult!).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Test Title\nTest Text\nhttps://example.com'
      );
    });
  });

  describe('アプリ情報取得', () => {
    it('アプリ情報を取得する', async () => {
      const { result } = renderHook(() => usePWA());

      // Service Worker登録を待つ
      await waitFor(() => {
        expect(result.current.isServiceWorkerRegistered).toBe(true);
      });

      let appInfo: any;
      await act(async () => {
        appInfo = await result.current.getAppInfo();
      });

      expect(appInfo).toEqual({
        version: expect.any(String),
        isOnline: true,
        isInstalled: false,
        isStandalone: false,
        notificationPermission: 'default',
        serviceWorkerRegistered: true,
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('Service Worker登録エラーを処理する', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Service Worker登録を失敗させる
      (navigator.serviceWorker.register as jest.Mock).mockRejectedValue(
        new Error('Registration failed')
      );

      renderHook(() => usePWA());

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Service Worker registration failed:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('通知許可要求エラーを処理する', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // 通知許可要求を失敗させる
      (Notification.requestPermission as jest.Mock).mockRejectedValue(
        new Error('Permission request failed')
      );

      const { result } = renderHook(() => usePWA());

      let permissionResult: boolean;
      await act(async () => {
        permissionResult = await result.current.requestNotificationPermission();
      });

      expect(permissionResult!).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('クリーンアップ', () => {
    it('コンポーネントアンマウント時にイベントリスナーが削除される', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => usePWA());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});