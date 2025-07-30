import { useState } from 'react';
import { 
  RefreshCw, 
  Download, 
  Upload, 
  Settings, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Trash2,
  FileText
} from 'lucide-react';
import { 
  useSyncManager, 
  useSyncHistory, 
  useExportBookmarks,
  useImportBookmarks,
  useClearSyncData,
  useSetupAutoSync
} from '../hooks/useSync';
import SyncProgress from './SyncProgress';
import { clsx } from 'clsx';
import type { SyncOptions } from '../services/syncService';

const SyncManager = () => {
  const {
    isSync,
    activeSyncJob,
    lastSync,
    syncStats,
    startSync,
    cancelSync,
    isStarting,
    isCanceling,
    startError,
  } = useSyncManager();

  const { data: syncHistory = [] } = useSyncHistory(5);
  const exportMutation = useExportBookmarks();
  const importMutation = useImportBookmarks();
  const clearDataMutation = useClearSyncData();
  const autoSyncMutation = useSetupAutoSync();

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [syncOptions, setSyncOptions] = useState<SyncOptions>({
    fullSync: false,
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const handleStartSync = async () => {
    try {
      await startSync(syncOptions);
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      await exportMutation.mutateAsync(format);
    } catch (error) {
      console.error('Failed to export bookmarks:', error);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    try {
      await importMutation.mutateAsync(importFile);
      setImportFile(null);
    } catch (error) {
      console.error('Failed to import bookmarks:', error);
    }
  };

  const handleClearData = async () => {
    if (!confirm('すべての同期データを削除しますか？この操作は取り消せません。')) {
      return;
    }
    
    try {
      await clearDataMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to clear sync data:', error);
    }
  };

  const handleAutoSyncToggle = async () => {
    try {
      await autoSyncMutation.mutateAsync({
        enabled: !autoSyncEnabled,
        intervalHours: 24,
      });
      setAutoSyncEnabled(!autoSyncEnabled);
    } catch (error) {
      console.error('Failed to update auto-sync settings:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'running':
      case 'pending':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Status Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              ブックマーク同期
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Xからブックマークを同期・管理
            </p>
          </div>
          
          {lastSync && (
            <div className="text-right">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                最終同期
              </div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {formatDate(lastSync.completedAt || lastSync.createdAt)}
              </div>
            </div>
          )}
        </div>

        {/* Current Sync Progress */}
        {isSync && activeSyncJob && (
          <div className="mb-6">
            <SyncProgress
              jobId={activeSyncJob.id}
              onComplete={() => window.location.reload()}
              onCancel={() => cancelSync()}
            />
          </div>
        )}

        {/* Sync Actions */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleStartSync}
              disabled={isSync || isStarting}
              className={clsx(
                'btn-primary flex items-center space-x-2',
                (isSync || isStarting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RefreshCw className={clsx('w-4 h-4', isStarting && 'animate-spin')} />
              <span>
                {isSync ? '同期中...' : isStarting ? '開始中...' : '同期開始'}
              </span>
            </button>

            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Settings className="w-4 h-4" />
              <span>詳細設定</span>
            </button>
          </div>

          {startError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                <span className="text-sm text-red-800 dark:text-red-200">
                  {startError.message || '同期の開始に失敗しました'}
                </span>
              </div>
            </div>
          )}

          {/* Advanced Options */}
          {showAdvancedOptions && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                同期オプション
              </h3>
              
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={syncOptions.fullSync}
                    onChange={(e) => setSyncOptions({
                      ...syncOptions,
                      fullSync: e.target.checked
                    })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    フル同期（すべてのブックマークを再取得）
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={handleAutoSyncToggle}
                    disabled={autoSyncMutation.isPending}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    自動同期を有効にする（24時間間隔）
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sync Statistics */}
      {syncStats && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            同期統計
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {syncStats.totalSyncs}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                総同期回数
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {syncStats.successfulSyncs}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                成功回数
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {syncStats.totalBookmarksImported}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                取得ブックマーク数
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {syncStats.totalSyncs > 0 ? Math.round((syncStats.successfulSyncs / syncStats.totalSyncs) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                成功率
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Management */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          データ管理
        </h3>
        
        <div className="space-y-4">
          {/* Export */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <Download className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  データエクスポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  ブックマークデータをダウンロード
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleExport('json')}
                disabled={exportMutation.isPending}
                className="btn-secondary text-sm"
              >
                JSON
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={exportMutation.isPending}
                className="btn-secondary text-sm"
              >
                CSV
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <Upload className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  データインポート
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  ファイルからブックマークを追加
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept=".json,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="btn-secondary text-sm cursor-pointer"
              >
                ファイル選択
              </label>
              {importFile && (
                <button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                  className="btn-primary text-sm"
                >
                  インポート
                </button>
              )}
            </div>
          </div>

          {/* Clear Data */}
          <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center space-x-3">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              <div>
                <div className="font-medium text-red-800 dark:text-red-200">
                  データ削除
                </div>
                <div className="text-sm text-red-600 dark:text-red-400">
                  すべての同期データを削除（取り消し不可）
                </div>
              </div>
            </div>
            <button
              onClick={handleClearData}
              disabled={clearDataMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              削除
            </button>
          </div>
        </div>
      </div>

      {/* Sync History */}
      {syncHistory.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            同期履歴
          </h3>
          <div className="space-y-3">
            {syncHistory.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  {getSyncStatusIcon(job.status)}
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(job.createdAt)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {job.status === 'completed' && job.result && (
                        `${job.result.newBookmarks}件の新規ブックマーク, ${job.result.updatedBookmarks}件の更新`
                      )}
                      {job.status === 'failed' && job.error && job.error}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {job.progress !== undefined && `${job.progress}%`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncManager;