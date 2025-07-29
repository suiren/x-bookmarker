/**
 * インポートパネル
 * データインポート機能のUI
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Chrome,
  Firefox,
  Database,
  Settings,
  Eye,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ImportOptions {
  source: 'x-bookmarker' | 'twitter' | 'chrome' | 'firefox' | 'csv' | 'json';
  duplicateStrategy: 'skip' | 'update' | 'create_duplicate';
  defaultCategory?: string;
  validate: boolean;
  dryRun?: boolean;
}

interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedRecords: number;
  detectedFormat: string;
  preview: any[];
}

interface ImportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
  };
  result?: {
    totalProcessed: number;
    imported: number;
    skipped: number;
    errors: number;
    warnings: string[];
  };
  error?: string;
  createdAt: string;
}

export const ImportPanel: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    source: 'json',
    duplicateStrategy: 'skip',
    validate: true,
    dryRun: false,
  });
  
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル選択ハンドラー
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
      
      // ファイル形式を自動判定
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'json') {
        setImportOptions(prev => ({ ...prev, source: 'json' }));
      } else if (extension === 'csv') {
        setImportOptions(prev => ({ ...prev, source: 'csv' }));
      }
    }
  };

  // ドラッグ&ドロップハンドラー
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
    }
  };

  // ファイル検証
  const validateFile = async () => {
    if (!selectedFile) return;
    
    setIsValidating(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('source', importOptions.source);

      const response = await fetch('/api/import/validate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('ファイル検証に失敗しました');
      }

      const result: ImportValidationResult = await response.json();
      setValidationResult(result);
      
    } catch (error) {
      console.error('検証エラー:', error);
      alert('ファイル検証に失敗しました');
    } finally {
      setIsValidating(false);
    }
  };

  // インポート開始
  const startImport = async () => {
    if (!selectedFile || !validationResult?.valid) return;
    
    setIsImporting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      Object.entries(importOptions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('インポートの開始に失敗しました');
      }

      const { jobId } = await response.json();
      
      // ジョブ監視を開始
      monitorImportJob(jobId);
      
    } catch (error) {
      console.error('インポートエラー:', error);
      alert('インポートの開始に失敗しました');
    } finally {
      setIsImporting(false);
    }
  };

  // インポートジョブの監視
  const monitorImportJob = async (jobId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/import/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.ok) {
          const job: ImportJob = await response.json();
          setActiveJob(job);

          if (job.status === 'completed' || job.status === 'failed') {
            // 履歴を更新
            loadImportHistory();
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

  // インポート履歴の読み込み
  const loadImportHistory = async () => {
    try {
      const response = await fetch('/api/import/history?limit=10', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const { history } = await response.json();
        setImportHistory(history);
      }
    } catch (error) {
      console.error('履歴読み込みエラー:', error);
    }
  };

  // コンポーネント初期化時に履歴を読み込み
  useEffect(() => {
    loadImportHistory();
  }, []);

  // ファイル選択時に自動検証
  useEffect(() => {
    if (selectedFile && importOptions.validate) {
      validateFile();
    }
  }, [selectedFile, importOptions.source]);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'chrome': return Chrome;
      case 'firefox': return Firefox;
      case 'json': return Database;
      case 'csv': return FileText;
      default: return FileText;
    }
  };

  const getSourceLabel = (source: string) => {
    const labels = {
      'json': 'JSON',
      'csv': 'CSV',
      'chrome': 'Chrome ブックマーク',
      'firefox': 'Firefox ブックマーク',
      'x-bookmarker': 'X-Bookmarker エクスポート',
      'twitter': 'Twitter/X データ',
    };
    return labels[source as keyof typeof labels] || source;
  };

  return (
    <div className="space-y-6">
      {/* ファイル選択エリア */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            インポートファイル選択
          </h2>

          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          >
            {selectedFile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setValidationResult(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  ファイルを削除
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    ファイルをドラッグ&ドロップ
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    または
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  ファイルを選択
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,.html"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* サポート形式の説明 */}
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
              サポートするファイル形式:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-blue-700 dark:text-blue-300">
              <div>• JSON (.json)</div>
              <div>• CSV (.csv)</div>
              <div>• Chrome ブックマーク (.html)</div>
              <div>• Firefox ブックマーク (.html)</div>
              <div>• X-Bookmarker エクスポート</div>
            </div>
          </div>
        </div>
      </div>

      {/* インポート設定 */}
      {selectedFile && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              インポート設定
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* データソース */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  データソース
                </label>
                <select
                  value={importOptions.source}
                  onChange={(e) => setImportOptions(prev => ({ 
                    ...prev, 
                    source: e.target.value as any 
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="chrome">Chrome ブックマーク</option>
                  <option value="firefox">Firefox ブックマーク</option>
                  <option value="x-bookmarker">X-Bookmarker エクスポート</option>
                </select>
              </div>

              {/* 重複処理 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  重複データの処理
                </label>
                <select
                  value={importOptions.duplicateStrategy}
                  onChange={(e) => setImportOptions(prev => ({ 
                    ...prev, 
                    duplicateStrategy: e.target.value as any 
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="skip">スキップ（無視）</option>
                  <option value="update">更新（上書き）</option>
                  <option value="create_duplicate">重複作成</option>
                </select>
              </div>
            </div>

            {/* オプション */}
            <div className="mt-6 space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={importOptions.validate}
                  onChange={(e) => setImportOptions(prev => ({ 
                    ...prev, 
                    validate: e.target.checked 
                  }))}
                  className="text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  インポート前にファイルを検証
                </span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={importOptions.dryRun || false}
                  onChange={(e) => setImportOptions(prev => ({ 
                    ...prev, 
                    dryRun: e.target.checked 
                  }))}
                  className="text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  ドライラン（実際にインポートせずに検証のみ）
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ファイル検証結果 */}
      {validationResult && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                ファイル検証結果
              </h3>
              {validationResult.preview.length > 0 && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Eye className="w-4 h-4" />
                  プレビュー
                </button>
              )}
            </div>

            <div className="space-y-4">
              {/* 検証ステータス */}
              <div className={`p-4 rounded-lg border ${
                validationResult.valid 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    validationResult.valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                  }`}>
                    {validationResult.valid ? '検証成功' : '検証失敗'}
                  </span>
                </div>
                
                <div className="mt-2 text-sm">
                  <p className={validationResult.valid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                    形式: {validationResult.detectedFormat} • 
                    推定レコード数: {validationResult.estimatedRecords.toLocaleString()} 件
                  </p>
                </div>
              </div>

              {/* エラーメッセージ */}
              {validationResult.errors.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200">エラー:</h4>
                  {validationResult.errors.map((error, index) => (
                    <p key={index} className="text-sm text-red-700 dark:text-red-300">• {error}</p>
                  ))}
                </div>
              )}

              {/* 警告メッセージ */}
              {validationResult.warnings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">警告:</h4>
                  {validationResult.warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-yellow-700 dark:text-yellow-300">• {warning}</p>
                  ))}
                </div>
              )}
            </div>

            {/* プレビュー */}
            {showPreview && validationResult.preview.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    データプレビュー（最初の5件）
                  </h4>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-64 overflow-auto">
                  <pre className="text-xs text-gray-800 dark:text-gray-200">
                    {JSON.stringify(validationResult.preview, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* インポート実行 */}
      {selectedFile && validationResult?.valid && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <button
              onClick={startImport}
              disabled={isImporting || !!activeJob}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {isImporting || activeJob?.status === 'processing' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  インポート中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {importOptions.dryRun ? 'ドライラン実行' : 'インポート開始'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 進行中のインポート */}
      {activeJob && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              インポート進行状況
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
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    インポート完了
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-green-600 dark:text-green-400">処理済:</span>
                      <span className="ml-1 font-medium">{activeJob.result.totalProcessed}</span>
                    </div>
                    <div>
                      <span className="text-green-600 dark:text-green-400">インポート:</span>
                      <span className="ml-1 font-medium">{activeJob.result.imported}</span>
                    </div>
                    <div>
                      <span className="text-yellow-600 dark:text-yellow-400">スキップ:</span>
                      <span className="ml-1 font-medium">{activeJob.result.skipped}</span>
                    </div>
                    <div>
                      <span className="text-red-600 dark:text-red-400">エラー:</span>
                      <span className="ml-1 font-medium">{activeJob.result.errors}</span>
                    </div>
                  </div>
                  
                  {activeJob.result.warnings.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-green-600 dark:text-green-400 mb-1">警告:</p>
                      <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                        {activeJob.result.warnings.slice(0, 3).map((warning, index) => (
                          <p key={index}>• {warning}</p>
                        ))}
                        {activeJob.result.warnings.length > 3 && (
                          <p>... 他 {activeJob.result.warnings.length - 3} 件</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeJob.status === 'failed' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    インポートに失敗しました
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

      {/* インポート履歴 */}
      {importHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                インポート履歴
              </h3>
              <button
                onClick={loadImportHistory}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                更新
              </button>
            </div>

            <div className="space-y-3">
              {importHistory.map((job) => (
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
                    
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        インポートジョブ #{job.jobId.slice(-8)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(job.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })}
                        {job.result && (
                          <span className="ml-2">
                            {job.result.imported} 件インポート • {job.result.skipped} 件スキップ
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {job.result && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round((job.result.imported / job.result.totalProcessed) * 100)}% 成功
                    </div>
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