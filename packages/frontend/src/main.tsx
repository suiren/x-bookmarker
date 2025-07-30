import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default cache strategy
      staleTime: 5 * 60 * 1000, // 5分 - デフォルト
      gcTime: 10 * 60 * 1000, // 10分 - ガベージコレクションタイム
      retry: 2,
      refetchOnWindowFocus: false, // ウィンドウフォーカス時の自動再取得を無効
      refetchOnReconnect: true, // ネットワーク再接続時は再取得
      refetchOnMount: true, // マウント時は再取得
    },
    mutations: {
      retry: 1, // ミューテーションは1回のみリトライ
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);