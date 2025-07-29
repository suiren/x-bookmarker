/**
 * エクスポートパネル
 * データエクスポート機能のUI
 */

import React, { useState, useEffect } from 'react';
import { 
  Download, 
  FileText, 
  Database, 
  Calendar,
  Folder,
  Tag,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useCategories } from '../../hooks/useCategories';

interface ExportOptions {
  format: 'json' | 'csv' | 'zip';
  includeBookmarks: boolean;
  includeCategories: boolean;
  includeSearchHistory: boolean;
  includeTags: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
  categories?: string[];
}

interface ExportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
  };
  result?: {
    fileUrl: string;
    fileName: string;
    fileSize: number;
    recordCount: number;
  };
  error?: string;
  createdAt: string;
}

export const ExportPanel: React.FC = () => {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    includeBookmarks: true,
    includeCategories: true,
    includeSearchHistory: false,
    includeTags: true,
  });

  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [useDateRange, setUseDateRange] = useState(false);
  const [useCategories, setUseCategories] = useState(false);

  const { categories } = useCategories();

  // エクスポート開始
  const startExport = async () => {
    setIsExporting(true);
    
    try {
      const options = { ...exportOptions };
      
      // 日付範囲が無効な場合は削除
      if (!useDateRange || !options.dateRange?.from || !options.dateRange?.to) {
        delete options.dateRange;
      }
      
      // カテゴリフィルターが無効な場合は削除
      if (!useCategories || !options.categories?.length) {
        delete options.categories;
      }

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error('エクスポートの開始に失敗しました');
      }

      const { jobId } = await response.json();
      
      // ジョブ監視を開始
      monitorExportJob(jobId);
      
    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert('エクスポートの開始に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  // エクスポートジョブの監視
  const monitorExportJob = async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/export/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.ok) {
          const job: ExportJob = await response.json();
          setActiveJob(job);

          if (job.status === 'completed' || job.status === 'failed') {
            // 履歴を更新
            loadExportHistory();
            return; // 監視終了
          }
        }
      } catch (error) {
        console.error('ステータス取得エラー:', error);
      }
      
      // 1秒後に再チェック
      setTimeout(checkStatus, 1000);
    };

    checkStatus();
  };

  // エクスポート履歴の読み込み
  const loadExportHistory = async () => {
    try {
      const response = await fetch('/api/export/history?limit=10', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const { history } = await response.json();
        setExportHistory(history);
      }
    } catch (error) {
      console.error('履歴読み込みエラー:', error);
    }
  };

  // コンポーネント初期化時に履歴を読み込み
  useEffect(() => {
    loadExportHistory();
  }, []);

  // ファイルサイズの表示用フォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* エクスポート設定 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            エクスポート設定
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 出力形式 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                出力形式
              </label>
              <div className="space-y-2">
                {[
                  { value: 'json', label: 'JSON', desc: '完全なデータ構造' },
                  { value: 'csv', label: 'CSV', desc: 'スプレッドシート用' },
                  { value: 'zip', label: 'ZIP', desc: 'JSON + CSV セット' },
                ].map((option) => (
                  <label key={option.value} className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="format"
                      value={option.value}
                      checked={exportOptions.format === option.value}
                      onChange={(e) => setExportOptions(prev => ({ 
                        ...prev, 
                        format: e.target.value as any 
                      }))}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {option.desc}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* エクスポート内容 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                エクスポート内容
              </label>
              <div className="space-y-2">
                {[
                  { key: 'includeBookmarks', label: 'ブックマーク', icon: FileText },
                  { key: 'includeCategories', label: 'カテゴリ', icon: Folder },
                  { key: 'includeSearchHistory', label: '検索履歴', icon: Search },
                  { key: 'includeTags', label: 'タグ', icon: Tag },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <label key={option.key} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={exportOptions[option.key as keyof ExportOptions] as boolean}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          [option.key]: e.target.checked
                        }))}
                        className="text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* フィルターオプション */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              フィルターオプション
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 日付範囲 */}
              <div>
                <label className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    checked={useDateRange}
                    onChange={(e) => setUseDateRange(e.target.checked)}
                    className="text-blue-600 focus:ring-blue-500 rounded"
                  />
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    日付範囲で絞り込み
                  </span>
                </label>
                
                {useDateRange && (
                  <div className="space-y-3 ml-6">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        開始日
                      </label>
                      <input
                        type="date"
                        value={exportOptions.dateRange?.from || ''}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          dateRange: {
                            ...prev.dateRange,
                            from: e.target.value,
                            to: prev.dateRange?.to || ''
                          }
                        }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        終了日
                      </label>
                      <input
                        type="date"
                        value={exportOptions.dateRange?.to || ''}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          dateRange: {
                            ...prev.dateRange,
                            from: prev.dateRange?.from || '',
                            to: e.target.value
                          }
                        }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* カテゴリ選択 */}
              <div>
                <label className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    checked={useCategories}
                    onChange={(e) => setUseCategories(e.target.checked)}
                    className="text-blue-600 focus:ring-blue-500 rounded"
                  />
                  <Folder className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    特定カテゴリのみ
                  </span>
                </label>
                
                {useCategories && (
                  <div className="ml-6 max-h-32 overflow-y-auto space-y-2">
                    {categories.map((category) => (
                      <label key={category.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={exportOptions.categories?.includes(category.id) || false}
                          onChange={(e) => {
                            const categoryIds = exportOptions.categories || [];
                            if (e.target.checked) {
                              setExportOptions(prev => ({
                                ...prev,
                                categories: [...categoryIds, category.id]
                              }));
                            } else {
                              setExportOptions(prev => ({
                                ...prev,
                                categories: categoryIds.filter(id => id !== category.id)
                              }));
                            }
                          }}
                          className="text-blue-600 focus:ring-blue-500 rounded"
                        />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {category.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* エクスポート実行ボタン */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={startExport}
              disabled={isExporting || !!activeJob}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {isExporting || activeJob?.status === 'processing' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  エクスポート中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  エクスポート開始
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 進行中のエクスポート */}
      {activeJob && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              エクスポート進行状況
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {activeJob.status === 'processing' && (
                    <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  {activeJob.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {activeJob.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {activeJob.progress.currentStep}
                  </span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {activeJob.progress.percentage}%
                </span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${activeJob.progress.percentage}%` }}
                />
              </div>

              {activeJob.status === 'completed' && activeJob.result && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        エクスポート完了
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {activeJob.result.fileName} ({formatFileSize(activeJob.result.fileSize)})
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {activeJob.result.recordCount.toLocaleString()} 件のレコード
                      </p>
                    </div>
                    <a
                      href={activeJob.result.fileUrl}
                      download={activeJob.result.fileName}
                      className="inline-flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      ダウンロード
                    </a>
                  </div>
                </div>
              )}

              {activeJob.status === 'failed' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    エクスポートに失敗しました
                  </p>
                  {activeJob.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {activeJob.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* エクスポート履歴 */}
      {exportHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                エクスポート履歴
              </h3>
              <button
                onClick={loadExportHistory}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                更新
              </button>
            </div>

            <div className="space-y-3">
              {exportHistory.map((job) => (
                <div
                  key={job.jobId}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {job.status === 'completed' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {job.status === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    {job.status === 'processing' && (
                      <Clock className="w-4 h-4 text-blue-500" />
                    )}
                    
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {job.result?.fileName || 'エクスポートジョブ'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(job.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })}
                        {job.result && (
                          <span className="ml-2">
                            {formatFileSize(job.result.fileSize)} • {job.result.recordCount.toLocaleString()} 件
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {job.status === 'completed' && job.result && (
                    <a
                      href={job.result.fileUrl}
                      download={job.result.fileName}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};