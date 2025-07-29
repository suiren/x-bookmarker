import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Download, 
  Upload, 
  RefreshCw, 
  Check, 
  X, 
  AlertTriangle, 
  Loader2,
  Pause,
  Play
} from 'lucide-react';
import { useSyncProgress, useCancelSync } from '../hooks/useSync';
import type { SyncProgress as SyncProgressType } from '../services/syncService';
import { clsx } from 'clsx';

interface SyncProgressProps {
  jobId: string;
  onComplete?: () => void;
  onCancel?: () => void;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

interface SSEConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  reconnectAttempts: number;
  lastError?: string;
  connectionHealth: 'good' | 'poor' | 'failed';
}

const SyncProgress = ({ 
  jobId, 
  onComplete, 
  onCancel,
  autoReconnect = true,
  maxReconnectAttempts = 5 
}: SyncProgressProps) => {
  const { progress, isPolling } = useSyncProgress(jobId);
  const cancelMutation = useCancelSync();
  const [showDetails, setShowDetails] = useState(false);
  const [connectionState, setConnectionState] = useState<SSEConnectionState>({
    status: 'connecting',
    reconnectAttempts: 0,
    connectionHealth: 'good',
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  
  const startTimeRef = useRef(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressHistoryRef = useRef<Array<{ timestamp: number; processed: number }>>([]);
  const connectionHealthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef(Date.now());

  // 経過時間の更新
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTimeRef.current);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 処理速度と残り時間の計算
  const updateEstimatedTime = useCallback(() => {
    if (!progress || progress.total <= 0) {
      setEstimatedTimeRemaining(null);
      return;
    }

    const history = progressHistoryRef.current;
    if (history.length < 2) return;

    // 最近の5つのデータポイントから処理速度を計算
    const recentHistory = history.slice(-5);
    const timeSpan = recentHistory[recentHistory.length - 1].timestamp - recentHistory[0].timestamp;
    const processedSpan = recentHistory[recentHistory.length - 1].processed - recentHistory[0].processed;

    if (timeSpan > 0 && processedSpan > 0) {
      const itemsPerMs = processedSpan / timeSpan;
      const remaining = progress.total - progress.current;
      const estimatedMs = remaining / itemsPerMs;
      setEstimatedTimeRemaining(Math.round(estimatedMs / 1000)); // 秒単位
    }
  }, [progress]);

  // プログレス履歴の更新
  useEffect(() => {
    if (progress && progress.current > 0) {
      const now = Date.now();
      progressHistoryRef.current.push({
        timestamp: now,
        processed: progress.current,
      });

      // 履歴を最大10件に制限
      if (progressHistoryRef.current.length > 10) {
        progressHistoryRef.current = progressHistoryRef.current.slice(-10);
      }

      updateEstimatedTime();
    }
  }, [progress?.current, updateEstimatedTime]);

  // SSE接続の健全性チェック
  const checkConnectionHealth = useCallback(() => {
    const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
    
    let newHealth: SSEConnectionState['connectionHealth'] = 'good';
    if (timeSinceLastMessage > 30000) { // 30秒
      newHealth = 'failed';
    } else if (timeSinceLastMessage > 15000) { // 15秒
      newHealth = 'poor';
    }

    setConnectionState(prev => ({
      ...prev,
      connectionHealth: newHealth,
    }));
  }, []);

  // 接続健全性チェックの開始
  useEffect(() => {
    connectionHealthCheckRef.current = setInterval(checkConnectionHealth, 5000);
    return () => {
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
      }
    };
  }, [checkConnectionHealth]);

  // SSE再接続ロジック
  const reconnectSSE = useCallback(() => {
    if (!autoReconnect || connectionState.reconnectAttempts >= maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, connectionState.reconnectAttempts), 30000);
    
    setConnectionState(prev => ({
      ...prev,
      status: 'reconnecting',
    }));

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`SSE再接続試行 ${connectionState.reconnectAttempts + 1}/${maxReconnectAttempts}`);
      
      setConnectionState(prev => ({
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
      
      // useSyncProgressフックの再初期化を促す
      // 実際の実装では、hookの内部で再接続を処理する必要がある
    }, delay);
  }, [autoReconnect, connectionState.reconnectAttempts, maxReconnectAttempts]);

  // 完了処理
  useEffect(() => {
    if (progress?.phase === 'completed' && onComplete) {
      onComplete();
    }
  }, [progress?.phase, onComplete]);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(jobId);
      onCancel?.();
    } catch (error) {
      console.error('Failed to cancel sync:', error);
    }
  };

  if (!progress) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">
          同期状況を確認中...
        </span>
      </div>
    );
  }

  const getPhaseIcon = (phase: SyncProgressType['phase']) => {
    switch (phase) {
      case 'initializing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
      case 'fetching':
        return <Download className="w-5 h-5 text-blue-600" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />;
      case 'storing':
        return <Upload className="w-5 h-5 text-blue-600" />;
      case 'completing':
        return <Loader2 className="w-5 h-5 animate-spin text-green-600" />;
      case 'completed':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin text-gray-600" />;
    }
  };

  const getPhaseLabel = (phase: SyncProgressType['phase']) => {
    switch (phase) {
      case 'initializing':
        return '初期化中';
      case 'fetching':
        return 'データ取得中';
      case 'processing':
        return '処理中';
      case 'storing':
        return '保存中';
      case 'completing':
        return '完了処理中';
      case 'completed':
        return '完了';
      case 'error':
        return 'エラー';
      default:
        return '処理中';
    }
  };

  const progressPercentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const isActive = ['initializing', 'fetching', 'processing', 'storing', 'completing'].includes(progress.phase);
  const isCompleted = progress.phase === 'completed';
  const hasError = progress.phase === 'error';

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-800 rounded-lg border p-6 space-y-4',
      hasError ? 'border-red-200 dark:border-red-800' : 
      isCompleted ? 'border-green-200 dark:border-green-800' :
      'border-gray-200 dark:border-gray-700'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getPhaseIcon(progress.phase)}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              ブックマーク同期
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {getPhaseLabel(progress.phase)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {progress.errors && progress.errors.length > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              エラー詳細
            </button>
          )}
          
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="btn-secondary text-sm py-1 px-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'キャンセル'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {progress.message}
          </span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {progress.total > 0 ? `${progress.current} / ${progress.total}` : ''}
          </span>
        </div>
        
        {progress.total > 0 && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={clsx(
                'h-2 rounded-full transition-all duration-300',
                hasError ? 'bg-red-500' :
                isCompleted ? 'bg-green-500' :
                'bg-primary-600'
              )}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
        )}
        
        {progress.total > 0 && (
          <div className="text-right">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Math.round(progressPercentage)}%
            </span>
          </div>
        )}
      </div>

      {/* Enhanced Status Indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            {connectionState.status === 'connected' && connectionState.connectionHealth === 'good' ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-gray-600 dark:text-gray-400">リアルタイム更新中</span>
              </>
            ) : connectionState.status === 'reconnecting' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                <span className="text-yellow-600 dark:text-yellow-400">
                  再接続中... ({connectionState.reconnectAttempts}/{maxReconnectAttempts})
                </span>
              </>
            ) : connectionState.status === 'error' ? (
              <>
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-red-600 dark:text-red-400">接続エラー</span>
                {autoReconnect && connectionState.reconnectAttempts < maxReconnectAttempts && (
                  <button
                    onClick={reconnectSSE}
                    className="text-xs text-primary-600 hover:text-primary-700 underline"
                  >
                    手動再接続
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-gray-600 dark:text-gray-400">更新停止</span>
              </>
            )}
          </div>
          
          {/* 経過時間と推定残り時間 */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-x-4">
            <span>経過時間: {Math.floor(elapsedTime / 1000)}秒</span>
            {estimatedTimeRemaining !== null && isActive && (
              <span>残り時間: 約{estimatedTimeRemaining}秒</span>
            )}
          </div>
        </div>
        
        {/* 処理速度表示 */}
        {progress && progress.total > 0 && progressHistoryRef.current.length >= 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {(() => {
              const history = progressHistoryRef.current;
              const recent = history.slice(-3);
              if (recent.length < 2) return null;
              
              const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
              const processedSpan = recent[recent.length - 1].processed - recent[0].processed;
              
              if (timeSpan > 0 && processedSpan > 0) {
                const itemsPerSecond = Math.round((processedSpan / timeSpan) * 1000);
                return `処理速度: ${itemsPerSecond}件/秒`;
              }
              return null;
            })()}
          </div>
        )}
      </div>

      {/* Error Details */}
      {showDetails && progress.errors && progress.errors.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            エラー詳細:
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {progress.errors.map((error, index) => (
              <div
                key={index}
                className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800"
              >
                {error}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Message with Performance Stats */}
      {isCompleted && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">
                同期が正常に完了しました
              </span>
            </div>
            {progress && progress.total > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-4">
                <div>総処理時間: {Math.floor(elapsedTime / 1000)}秒</div>
                <div>平均処理速度: {Math.round(progress.total / (elapsedTime / 1000))}件/秒</div>
                <div>総処理件数: {progress.total}件</div>
                <div>エラー件数: {progress.errors?.length || 0}件</div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Connection Quality Warning */}
      {connectionState.connectionHealth === 'poor' && (
        <div className="border-t border-yellow-200 dark:border-yellow-800 pt-4">
          <div className="flex items-center space-x-2 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              接続が不安定です。進捗の更新が遅れる可能性があります。
            </span>
          </div>
        </div>
      )}
      
      {/* Auto-reconnect disabled warning */}
      {!autoReconnect && connectionState.status === 'error' && (
        <div className="border-t border-red-200 dark:border-red-800 pt-4">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <X className="w-4 h-4" />
            <span className="text-sm">
              自動再接続が無効です。進捗の更新を受信できません。
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncProgress;

// 時間フォーマット用のヘルパー関数
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}時間${minutes}分`;
  }
}