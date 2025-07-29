import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the sync service first before any imports that use it
const mockSyncService = {
  getSyncStatus: vi.fn(),
  startSync: vi.fn(),
  cancelSync: vi.fn(),
};

// Mock the entire sync service module
vi.doMock('../../services/syncService', () => ({
  syncService: mockSyncService,
  SyncOptions: {},
  SyncProgress: {},
}));

// Now import the component after mocking
import SyncProgress from '../SyncProgress';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState: number = EventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = EventSource.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  close() {
    this.readyState = EventSource.CLOSED;
  }

  static simulateMessage(data: any) {
    MockEventSource.instances.forEach(instance => {
      if (instance.onmessage && instance.readyState === EventSource.OPEN) {
        const event = new MessageEvent('message', {
          data: JSON.stringify(data)
        });
        instance.onmessage(event);
      }
    });
  }

  static simulateError() {
    MockEventSource.instances.forEach(instance => {
      if (instance.onerror) {
        instance.onerror(new Event('error'));
      }
    });
  }

  static clearInstances() {
    MockEventSource.instances = [];
  }
}

// Mock the EventSource globally
(global as any).EventSource = MockEventSource;

// Mock service is already defined above

describe('SyncProgress Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    MockEventSource.clearInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderSyncProgress = (props: {
    jobId: string;
    onComplete?: () => void;
    onCancel?: () => void;
  }) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SyncProgress {...props} />
      </QueryClientProvider>
    );
  };

  describe('初期表示', () => {
    it('should render sync progress component', () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      expect(screen.getByText('ブックマーク同期中')).toBeInTheDocument();
      expect(screen.getByText('Xからブックマークを取得しています...')).toBeInTheDocument();
    });

    it('should show cancel button', () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      expect(screen.getByText('キャンセル')).toBeInTheDocument();
    });

    it('should display initial progress state', () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      // Should show 0% progress initially
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('Server-Sent Events統合', () => {
    it('should establish SSE connection on mount', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
        expect(MockEventSource.instances[0].url).toContain('/api/sse/events/test-job-123');
      });
    });

    it('should handle connection confirmation', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate connection confirmation
      MockEventSource.simulateMessage({
        type: 'connected',
        jobId: 'test-job-123',
      });

      // Connection should be established
      expect(screen.queryByText('接続中...')).not.toBeInTheDocument();
    });

    it('should update progress from SSE messages', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate progress update
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 100,
          processed: 25,
          percentage: 25,
          currentItem: 'バッチ 1 / 4 (25件取得済み)',
          errors: [],
        },
        timestamp: new Date().toISOString(),
      });

      await waitFor(() => {
        expect(screen.getByText('25%')).toBeInTheDocument();
        expect(screen.getByText('バッチ 1 / 4 (25件取得済み)')).toBeInTheDocument();
      });
    });

    it('should handle completion message', async () => {
      const onComplete = vi.fn();
      renderSyncProgress({ jobId: 'test-job-123', onComplete });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate completion
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'completed',
        progress: {
          total: 100,
          processed: 100,
          percentage: 100,
          currentItem: '同期完了',
          errors: [],
        },
        result: {
          totalFetched: 100,
          newBookmarks: 60,
          updatedBookmarks: 40,
          errors: [],
          syncTime: 30000,
        },
        timestamp: new Date().toISOString(),
      });

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('同期完了')).toBeInTheDocument();
        expect(screen.getByText('60件の新規ブックマーク')).toBeInTheDocument();
        expect(screen.getByText('40件の更新')).toBeInTheDocument();
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('should handle error messages', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate error
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'failed',
        progress: {
          total: 100,
          processed: 25,
          percentage: 25,
          currentItem: 'エラーが発生しました',
          errors: ['Rate limit exceeded'],
        },
        error: 'Rate limit exceeded',
        timestamp: new Date().toISOString(),
      });

      await waitFor(() => {
        expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      });
    });

    it('should handle connection errors', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate connection error
      MockEventSource.simulateError();

      await waitFor(() => {
        expect(screen.getByText('接続エラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  describe('プログレスバー表示', () => {
    it('should update progress bar correctly', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate 50% progress
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 200,
          processed: 100,
          percentage: 50,
          currentItem: 'データベース保存中: 100 / 200',
          errors: [],
        },
      });

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '50');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should show indeterminate progress for unknown total', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate progress without total
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 0,
          processed: 0,
          percentage: 0,
          currentItem: '準備中...',
          errors: [],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('準備中...')).toBeInTheDocument();
        // Should show indeterminate progress
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveClass('animate-pulse');
      });
    });
  });

  describe('キャンセル機能', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn();
      mockSyncService.cancelSync.mockResolvedValue({ success: true });
      
      renderSyncProgress({ jobId: 'test-job-123', onCancel });
      
      const cancelButton = screen.getByText('キャンセル');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(mockSyncService.cancelSync).toHaveBeenCalledWith('test-job-123');
        expect(onCancel).toHaveBeenCalled();
      });
    });

    it('should disable cancel button during cancellation', async () => {
      const onCancel = vi.fn();
      mockSyncService.cancelSync.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      renderSyncProgress({ jobId: 'test-job-123', onCancel });
      
      const cancelButton = screen.getByText('キャンセル');
      fireEvent.click(cancelButton);

      // Button should be disabled during cancellation
      expect(cancelButton).toBeDisabled();
      expect(screen.getByText('キャンセル中...')).toBeInTheDocument();
    });

    it('should handle cancel errors', async () => {
      const onCancel = vi.fn();
      mockSyncService.cancelSync.mockRejectedValue(new Error('Cancel failed'));
      
      renderSyncProgress({ jobId: 'test-job-123', onCancel });
      
      const cancelButton = screen.getByText('キャンセル');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText('キャンセルに失敗しました')).toBeInTheDocument();
        expect(onCancel).not.toHaveBeenCalled();
      });
    });
  });

  describe('詳細情報表示', () => {
    it('should show detailed progress information', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate detailed progress
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 500,
          processed: 350,
          percentage: 70,
          currentItem: 'バッチ 7 / 10 (350件取得済み)',
          errors: ['一部のツイートを取得できませんでした'],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('350 / 500 件処理済み')).toBeInTheDocument();
        expect(screen.getByText('バッチ 7 / 10 (350件取得済み)')).toBeInTheDocument();
        expect(screen.getByText('1件のエラー')).toBeInTheDocument();
      });
    });

    it('should show elapsed time', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      // Wait a bit for elapsed time to increase
      await new Promise(resolve => setTimeout(resolve, 1100));

      await waitFor(() => {
        expect(screen.getByText(/経過時間: \d+秒/)).toBeInTheDocument();
      });
    });

    it('should estimate remaining time', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate progress with rate calculation
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 100,
          processed: 25,
          percentage: 25,
          currentItem: 'Processing...',
          errors: [],
        },
      });

      // Wait for time estimation calculation
      await new Promise(resolve => setTimeout(resolve, 2000));

      await waitFor(() => {
        // Should show estimated remaining time
        expect(screen.getByText(/残り時間: 約\d+秒/)).toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('should display multiple errors', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate progress with multiple errors
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'running',
        progress: {
          total: 100,
          processed: 50,
          percentage: 50,
          currentItem: 'エラーが発生しましたが続行中...',
          errors: [
            'バッチ 2: Rate limit exceeded',
            'バッチ 4: Invalid token',
            'バッチ 6: Network error',
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('3件のエラー')).toBeInTheDocument();
        
        // Click to show error details
        fireEvent.click(screen.getByText('3件のエラー'));
        
        expect(screen.getByText('バッチ 2: Rate limit exceeded')).toBeInTheDocument();
        expect(screen.getByText('バッチ 4: Invalid token')).toBeInTheDocument();
        expect(screen.getByText('バッチ 6: Network error')).toBeInTheDocument();
      });
    });

    it('should handle partial sync completion with errors', async () => {
      const onComplete = vi.fn();
      renderSyncProgress({ jobId: 'test-job-123', onComplete });
      
      await waitFor(() => {
        expect(MockEventSource.instances.length).toBe(1);
      });

      // Simulate completion with errors
      MockEventSource.simulateMessage({
        type: 'progress',
        jobId: 'test-job-123',
        status: 'completed',
        progress: {
          total: 100,
          processed: 100,
          percentage: 100,
          currentItem: '同期完了（一部エラーあり）',
          errors: ['20件のツイートを取得できませんでした'],
        },
        result: {
          totalFetched: 80,
          newBookmarks: 50,
          updatedBookmarks: 30,
          errors: ['20件のツイートを取得できませんでした'],
          syncTime: 45000,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('同期完了（一部エラーあり）')).toBeInTheDocument();
        expect(screen.getByText('50件の新規ブックマーク')).toBeInTheDocument();
        expect(screen.getByText('30件の更新')).toBeInTheDocument();
        expect(screen.getByText('1件のエラー')).toBeInTheDocument();
        expect(onComplete).toHaveBeenCalled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('should have proper ARIA attributes', () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', 'ブックマーク同期の進捗');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('should provide live region updates', async () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });

    it('should be keyboard accessible', () => {
      renderSyncProgress({ jobId: 'test-job-123' });
      
      const cancelButton = screen.getByText('キャンセル');
      expect(cancelButton).toHaveAttribute('tabindex', '0');
      
      // Test keyboard activation
      fireEvent.keyDown(cancelButton, { key: 'Enter' });
      expect(mockSyncService.cancelSync).toHaveBeenCalled();
    });
  });

  describe('メモリリーク対策', () => {
    it('should cleanup SSE connection on unmount', () => {
      const { unmount } = renderSyncProgress({ jobId: 'test-job-123' });
      
      expect(MockEventSource.instances.length).toBe(1);
      const instance = MockEventSource.instances[0];
      
      unmount();
      
      expect(instance.readyState).toBe(EventSource.CLOSED);
    });

    it('should cleanup timers on unmount', () => {
      const { unmount } = renderSyncProgress({ jobId: 'test-job-123' });
      
      // Start some timers
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      unmount();
      
      // Should cleanup timers
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});