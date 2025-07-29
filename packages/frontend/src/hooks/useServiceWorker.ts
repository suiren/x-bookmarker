/**
 * Service Worker管理hook
 */

import { useEffect, useState } from 'react';
import { Workbox } from 'workbox-window';

interface ServiceWorkerState {
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isOfflineReady: boolean;
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
}

interface ServiceWorkerActions {
  skipWaiting: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  unregister: () => Promise<boolean>;
}

export function useServiceWorker(): ServiceWorkerState & ServiceWorkerActions {
  const [state, setState] = useState<ServiceWorkerState>({
    isRegistered: false,
    isUpdateAvailable: false,
    isOfflineReady: false,
    registration: null,
    error: null
  });

  const [workbox, setWorkbox] = useState<Workbox | null>(null);

  useEffect(() => {
    // Service Workerをサポートしているかチェック
    if (!('serviceWorker' in navigator)) {
      setState(prev => ({
        ...prev,
        error: new Error('Service Worker is not supported in this browser')
      }));
      return;
    }

    // Workboxインスタンスを作成
    const wb = new Workbox('/sw.js', { scope: '/' });
    setWorkbox(wb);

    // Service Workerが正常に登録された時
    wb.addEventListener('installed', (event) => {
      console.log('✅ Service Worker installed', event);
      
      if (event.isUpdate) {
        setState(prev => ({
          ...prev,
          isUpdateAvailable: true
        }));
      } else {
        setState(prev => ({
          ...prev,
          isOfflineReady: true
        }));
      }
    });

    // Service Workerが制御を開始した時
    wb.addEventListener('controlling', (event) => {
      console.log('🎛️ Service Worker controlling', event);
      // リロードしてアップデートを適用
      window.location.reload();
    });

    // Service Workerの登録を実行
    wb.register()
      .then((registration) => {
        console.log('🚀 Service Worker registered:', registration);
        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration
        }));
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
        setState(prev => ({
          ...prev,
          error
        }));
      });

    // クリーンアップ
    return () => {
      // 必要に応じてイベントリスナーを削除
    };
  }, []);

  const skipWaiting = async (): Promise<void> => {
    if (!workbox) {
      throw new Error('Workbox is not initialized');
    }

    try {
      await workbox.messageSkipWaiting();
      setState(prev => ({
        ...prev,
        isUpdateAvailable: false
      }));
    } catch (error) {
      console.error('❌ Skip waiting failed:', error);
      throw error;
    }
  };

  const checkForUpdate = async (): Promise<void> => {
    if (!state.registration) {
      throw new Error('Service Worker is not registered');
    }

    try {
      await state.registration.update();
    } catch (error) {
      console.error('❌ Update check failed:', error);
      throw error;
    }
  };

  const unregister = async (): Promise<boolean> => {
    if (!state.registration) {
      throw new Error('Service Worker is not registered');
    }

    try {
      const result = await state.registration.unregister();
      if (result) {
        setState(prev => ({
          ...prev,
          isRegistered: false,
          registration: null
        }));
      }
      return result;
    } catch (error) {
      console.error('❌ Service Worker unregistration failed:', error);
      throw error;
    }
  };

  return {
    ...state,
    skipWaiting,
    checkForUpdate,
    unregister
  };
}