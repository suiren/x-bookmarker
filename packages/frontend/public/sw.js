// Service Worker for X Bookmarker PWA
const CACHE_NAME = 'x-bookmarker-v1.0.0';
const STATIC_CACHE_NAME = 'x-bookmarker-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'x-bookmarker-dynamic-v1.0.0';

// キャッシュするリソース
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/apple-touch-icon.svg',
  '/pwa-192x192.svg',
  '/pwa-512x512.svg',
  '/favicon.ico',
  // 追加の静的ファイルがあればここに追加
];

// API エンドポイント（キャッシュしない）
const API_ENDPOINTS = [
  '/api/',
  '/auth/',
];

// インストール時の処理
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('[SW] Error caching static assets:', error);
      })
  );
  
  // 新しいサービスワーカーを即座にアクティブ化
  self.skipWaiting();
});

// アクティベーション時の処理
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then(keyList => {
        return Promise.all(keyList.map(key => {
          // 古いキャッシュを削除
          if (key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        }));
      })
  );
  
  // 全てのクライアントを制御下に置く
  event.waitUntil(self.clients.claim());
});

// フェッチイベントの処理
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // APIリクエストの場合はネットワーク優先
  if (API_ENDPOINTS.some(endpoint => requestUrl.pathname.startsWith(endpoint))) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // 静的アセットの場合はキャッシュ優先
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request));
  }
});

// キャッシュ優先戦略
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // 成功したレスポンスをキャッシュに保存
    if (networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error);
    
    // オフライン時のフォールバック
    if (request.destination === 'document') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// ネットワーク優先戦略
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // APIレスポンスは通常キャッシュしないが、
    // 必要に応じて短時間のキャッシュを実装可能
    return networkResponse;
  } catch (error) {
    console.error('[SW] Network first strategy failed:', error);
    
    // ネットワークエラー時はキャッシュから取得を試行
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// プッシュ通知の処理
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'X Bookmarkerからの通知',
      icon: '/pwa-192x192.svg',
      badge: '/masked-icon.svg',
      image: data.image,
      data: data.data,
      actions: [
        {
          action: 'open',
          title: '開く',
          icon: '/pwa-192x192.svg'
        },
        {
          action: 'close',
          title: '閉じる'
        }
      ],
      requireInteraction: false,
      silent: false,
      timestamp: Date.now(),
      tag: data.tag || 'x-bookmarker-notification'
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'X Bookmarker', options)
    );
  } catch (error) {
    console.error('[SW] Error handling push notification:', error);
  }
});

// 通知クリック時の処理
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // アプリを開く
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 既に開いているタブがあれば、そこにフォーカス
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // 新しいタブでアプリを開く
        if (clients.openWindow) {
          const url = event.notification.data?.url || '/';
          return clients.openWindow(url);
        }
      })
  );
});

// 同期イベントの処理（バックグラウンド同期）
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

// バックグラウンド同期の処理
async function handleBackgroundSync() {
  try {
    // オフライン時に蓄積されたデータを同期
    const offlineActions = await getOfflineActions();
    
    for (const action of offlineActions) {
      try {
        await syncAction(action);
        await removeOfflineAction(action.id);
      } catch (error) {
        console.error('[SW] Failed to sync action:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// オフライン時のアクションを取得
async function getOfflineActions() {
  // IndexedDB や localStorage からオフライン時のアクションを取得
  // 実装は実際のデータストレージに依存
  return [];
}

// アクションを同期
async function syncAction(action) {
  const response = await fetch(action.url, {
    method: action.method,
    headers: action.headers,
    body: action.body
  });
  
  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }
  
  return response;
}

// オフラインアクションを削除
async function removeOfflineAction(actionId) {
  // IndexedDB や localStorage からアクションを削除
  // 実装は実際のデータストレージに依存
}

// メッセージイベントの処理
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// エラーハンドリング
self.addEventListener('error', event => {
  console.error('[SW] Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

console.log('[SW] Service Worker loaded successfully');