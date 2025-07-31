import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
}

interface PWANotificationState {
  permission: NotificationPermission;
  isSupported: boolean;
}

export const usePWA = () => {
  const [installState, setInstallState] = useState<PWAInstallState>({
    isInstallable: false,
    isInstalled: false,
    isStandalone: false,
    installPrompt: null,
  });

  const [notificationState, setNotificationState] = useState<PWANotificationState>({
    permission: 'default',
    isSupported: false,
  });

  const [serviceWorkerState, setServiceWorkerState] = useState({
    isRegistered: false,
    isUpdateAvailable: false,
    registration: null as ServiceWorkerRegistration | null,
  });

  // PWAインストール状態の初期化と監視
  useEffect(() => {
    // スタンドアロンモードか確認
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setInstallState(prev => ({
      ...prev,
      isStandalone,
      isInstalled: isStandalone,
    }));

    // beforeinstallprompt イベントを監視
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      
      setInstallState(prev => ({
        ...prev,
        isInstallable: true,
        installPrompt: event,
      }));
    };

    // アプリがインストールされた時
    const handleAppInstalled = () => {
      setInstallState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        installPrompt: null,
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 通知の初期化
  useEffect(() => {
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
    const permission = isSupported ? Notification.permission : 'denied';

    setNotificationState({
      isSupported,
      permission,
    });
  }, []);

  // Service Worker の登録と管理
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      setServiceWorkerState(prev => ({
        ...prev,
        isRegistered: true,
        registration,
      }));

      // アップデートの確認
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setServiceWorkerState(prev => ({
                ...prev,
                isUpdateAvailable: true,
              }));
            }
          });
        }
      });

      console.log('Service Worker registered successfully');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  // PWAをインストール
  const installPWA = useCallback(async () => {
    if (!installState.installPrompt) {
      return false;
    }

    try {
      await installState.installPrompt.prompt();
      const choiceResult = await installState.installPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        setInstallState(prev => ({
          ...prev,
          isInstallable: false,
          installPrompt: null,
        }));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('PWA installation failed:', error);
      return false;
    }
  }, [installState.installPrompt]);

  // 通知の許可を要求
  const requestNotificationPermission = useCallback(async () => {
    if (!notificationState.isSupported) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationState(prev => ({
        ...prev,
        permission,
      }));
      return permission === 'granted';
    } catch (error) {
      console.error('Notification permission request failed:', error);
      return false;
    }
  }, [notificationState.isSupported]);

  // 通知を送信
  const sendNotification = useCallback(async (
    title: string, 
    options?: NotificationOptions
  ) => {
    if (notificationState.permission !== 'granted' || !serviceWorkerState.registration) {
      return false;
    }

    try {
      await serviceWorkerState.registration.showNotification(title, {
        icon: '/pwa-192x192.svg',
        badge: '/masked-icon.svg',
        ...options,
      });
      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }, [notificationState.permission, serviceWorkerState.registration]);

  // Service Worker のアップデートを適用
  const applyServiceWorkerUpdate = useCallback(() => {
    if (!serviceWorkerState.registration) {
      return;
    }

    const waitingWorker = serviceWorkerState.registration.waiting;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      
      // ページをリロードしてアップデートを適用
      window.location.reload();
    }
  }, [serviceWorkerState.registration]);

  // オフライン状態の監視
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // アプリのシェア
  const shareContent = useCallback(async (data: ShareData) => {
    if (navigator.share) {
      try {
        await navigator.share(data);
        return true;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Sharing failed:', error);
        }
        return false;
      }
    }
    
    // Web Share API が使えない場合のフォールバック
    const url = data.url || window.location.href;
    const text = data.text || '';
    const title = data.title || document.title;
    
    // クリップボードにコピー
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
        return true;
      } catch (error) {
        console.error('Clipboard write failed:', error);
      }
    }
    
    return false;
  }, []);

  // アプリの統計情報を取得
  const getAppInfo = useCallback(async () => {
    let version = 'unknown';
    
    if (serviceWorkerState.registration) {
      try {
        const messageChannel = new MessageChannel();
        serviceWorkerState.registration.active?.postMessage(
          { type: 'GET_VERSION' },
          [messageChannel.port2]
        );
        
        const response = await new Promise((resolve) => {
          messageChannel.port1.onmessage = (event) => resolve(event.data);
          setTimeout(() => resolve({ version: 'timeout' }), 1000);
        });
        
        version = (response as any).version || 'unknown';
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    }

    return {
      version,
      isOnline,
      isInstalled: installState.isInstalled,
      isStandalone: installState.isStandalone,
      notificationPermission: notificationState.permission,
      serviceWorkerRegistered: serviceWorkerState.isRegistered,
    };
  }, [
    isOnline,
    installState.isInstalled,
    installState.isStandalone,
    notificationState.permission,
    serviceWorkerState.isRegistered,
    serviceWorkerState.registration,
  ]);

  return {
    // インストール関連
    isInstallable: installState.isInstallable,
    isInstalled: installState.isInstalled,
    isStandalone: installState.isStandalone,
    installPWA,

    // 通知関連
    notificationPermission: notificationState.permission,
    isNotificationSupported: notificationState.isSupported,
    requestNotificationPermission,
    sendNotification,

    // Service Worker関連
    isServiceWorkerRegistered: serviceWorkerState.isRegistered,
    isUpdateAvailable: serviceWorkerState.isUpdateAvailable,
    applyServiceWorkerUpdate,

    // その他の機能
    isOnline,
    shareContent,
    getAppInfo,
  };
};