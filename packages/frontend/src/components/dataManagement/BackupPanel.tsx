/**
 * バックアップパネル
 * 自動バックアップ管理のUI
 */

import React, { useState, useEffect } from 'react';
import { 
  Archive, 
  Clock, 
  Database,
  FileText,
  Settings,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Calendar,
  BarChart3,
  Download,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface BackupConfig {
  enabled: boolean;
  schedule: {
    daily: string;
    weekly: string;
    monthly: string;
  };
  retention: {
    dailyBackups: number;
    weeklyBackups: number;
    monthlyBackups: number;
  };
  targets: {
    database: boolean;
    userFiles: boolean;
    systemFiles: boolean;
    logs: boolean;
  };
  timezone: string;
}

interface BackupResult {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  timestamp: string;
  duration: number;
  status: 'success' | 'failure' | 'partial';
  size: number;
  files: string[];
  errors: string[];
  metadata: {
    databaseSize: number;
    userCount: number;
    bookmarkCount: number;
    fileCount: number;
  };
}

interface BackupStats {
  totalBackups: number;
  successRate: number;
  averageDuration: number;
  totalSize: number;
  totalSizeMB: number;
  lastBackup?: BackupResult;
  lastBackupAgo?: number;
}

export const BackupPanel: React.FC = () => {
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupResult[]>([]);
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // データ読み込み
  useEffect(() => {
    loadBackupData();
  }, []);

  const loadBackupData = async () => {
    setLoading(true);
    
    try {
      const [configRes, historyRes, statsRes] = await Promise.all([
        fetch('/api/backup/schedule/status', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/backup/history?limit=20', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/backup/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (configRes.ok) {
        const config = await configRes.json();
        setBackupConfig(config);
      }

      if (historyRes.ok) {
        const { history } = await historyRes.json();
        setBackupHistory(history);
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setBackupStats(stats);
      }
    } catch (error) {
      console.error('バックアップデータ読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手動バックアップ実行
  const runManualBackup = async (type: 'daily' | 'weekly' | 'monthly' = 'daily') => {
    setIsRunningBackup(true);
    
    try {
      const response = await fetch('/api/backup/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        alert('バックアップを開始しました。完了まで少々お待ちください。');
        // 数秒後にデータを再読み込み
        setTimeout(() => {
          loadBackupData();
        }, 3000);
      } else {
        throw new Error('バックアップの開始に失敗しました');
      }
    } catch (error) {
      console.error('バックアップエラー:', error);
      alert('バックアップの開始に失敗しました');
    } finally {
      setIsRunningBackup(false);
    }
  };

  // スケジュール開始/停止
  const toggleSchedule = async (action: 'start' | 'stop') => {
    try {
      const response = await fetch(`/api/backup/schedule/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        alert(`バックアップスケジュールを${action === 'start' ? '開始' : '停止'}しました`);
        loadBackupData();
      }
    } catch (error) {
      console.error('スケジュール操作エラー:', error);
      alert('操作に失敗しました');
    }
  };

  // ファイルサイズの表示用フォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${Math.round(remainingSeconds)}秒`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failure': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'partial': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      success: '成功',
      failure: '失敗',
      partial: '部分的成功',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      daily: '日次',
      weekly: '週次',
      monthly: '月次',
    };
    return labels[type as keyof typeof labels] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* バックアップ統計 */}
      {backupStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {backupStats.totalBackups}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">総バックアップ数</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {backupStats.successRate}%
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">成功率</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatDuration(backupStats.averageDuration)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">平均実行時間</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3">
              <Archive className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {backupStats.totalSizeMB} MB
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">総サイズ</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* バックアップ設定とコントロール */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 手動バックアップ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              手動バックアップ
            </h3>
            
            <div className="space-y-3">
              <button
                onClick={() => runManualBackup('daily')}
                disabled={isRunningBackup}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {isRunningBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    実行中...
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4" />
                    日次バックアップ実行
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => runManualBackup('weekly')}
                  disabled={isRunningBackup}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  週次
                </button>
                
                <button
                  onClick={() => runManualBackup('monthly')}
                  disabled={isRunningBackup}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Database className="w-4 h-4" />
                  月次
                </button>
              </div>
            </div>

            {backupStats?.lastBackup && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                  最後のバックアップ
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(backupStats.lastBackup.timestamp), 'yyyy/MM/dd HH:mm', { locale: ja })}
                  {backupStats.lastBackupAgo !== null && backupStats.lastBackupAgo !== undefined && (
                    <span className="ml-2">({backupStats.lastBackupAgo} 分前)</span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusIcon(backupStats.lastBackup.status)}
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {getStatusLabel(backupStats.lastBackup.status)} • 
                    {getTypeLabel(backupStats.lastBackup.type)} • 
                    {formatFileSize(backupStats.lastBackup.size)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* スケジュール設定 */}
        {backupConfig && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  自動バックアップ
                </h3>
                <div className="flex items-center gap-2">
                  {backupConfig.enabled ? (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-xs font-medium rounded-full">
                        <Play className="w-3 h-3" />
                        有効
                      </span>
                      <button
                        onClick={() => toggleSchedule('stop')}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-full">
                        <Pause className="w-3 h-3" />
                        無効
                      </span>
                      <button
                        onClick={() => toggleSchedule('start')}
                        className="text-green-600 hover:text-green-700 dark:text-green-400"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    日次バックアップ
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {backupConfig.schedule.daily} ({backupConfig.timezone})
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    保持期間: {backupConfig.retention.dailyBackups} 日
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    週次バックアップ
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {backupConfig.schedule.weekly} ({backupConfig.timezone})
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    保持期間: {backupConfig.retention.weeklyBackups} 週
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    月次バックアップ
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {backupConfig.schedule.monthly} ({backupConfig.timezone})
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    保持期間: {backupConfig.retention.monthlyBackups} ヶ月
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  バックアップ対象
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span className={backupConfig.targets.database ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                      データベース
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span className={backupConfig.targets.userFiles ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                      ユーザーファイル
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Settings className="w-3 h-3" />
                    <span className={backupConfig.targets.systemFiles ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                      システムファイル
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Archive className="w-3 h-3" />
                    <span className={backupConfig.targets.logs ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                      ログファイル
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* バックアップ履歴 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              バックアップ履歴
            </h3>
            <button
              onClick={loadBackupData}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              更新
            </button>
          </div>

          {backupHistory.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              バックアップ履歴がありません
            </p>
          ) : (
            <div className="space-y-3">
              {backupHistory.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(backup.status)}
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getTypeLabel(backup.type)}バックアップ
                        </p>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          backup.status === 'success' 
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                            : backup.status === 'failure'
                            ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                            : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                        }`}>
                          {getStatusLabel(backup.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(backup.timestamp), 'yyyy/MM/dd HH:mm', { locale: ja })} • 
                        {formatDuration(backup.duration / 1000)} • 
                        {formatFileSize(backup.size)}
                      </p>
                      {backup.metadata && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {backup.metadata.userCount} ユーザー • 
                          {backup.metadata.bookmarkCount.toLocaleString()} ブックマーク • 
                          {backup.metadata.fileCount} ファイル
                        </p>
                      )}
                      {backup.errors.length > 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          エラー: {backup.errors.slice(0, 2).join(', ')}
                          {backup.errors.length > 2 && ` (他 ${backup.errors.length - 2} 件)`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {backup.files.length} ファイル
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};