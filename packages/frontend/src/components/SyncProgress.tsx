import { useState, useEffect } from 'react';
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
}

const SyncProgress = ({ jobId, onComplete, onCancel }: SyncProgressProps) => {
  const { progress, isPolling } = useSyncProgress(jobId);
  const cancelMutation = useCancelSync();
  const [showDetails, setShowDetails] = useState(false);

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

      {/* Status Indicator */}
      <div className="flex items-center space-x-2 text-sm">
        {isPolling ? (
          <>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-600 dark:text-gray-400">リアルタイム更新中</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            <span className="text-gray-600 dark:text-gray-400">更新停止</span>
          </>
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

      {/* Success Message */}
      {isCompleted && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">
              同期が正常に完了しました
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncProgress;