import { useState, useEffect } from 'react';
import { Save, Download, Upload, Trash2, Loader2, Brain, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUpdateUserSettings } from '../hooks/useAuth';
import { useExportBookmarks, useImportBookmarks, useClearSyncData } from '../hooks/useSync';
import { useAIConfig, useUpdateAIConfig, useAIHealth } from '../hooks/useAI';

const SettingsPage = () => {
  const { user } = useAuthStore();
  const updateSettingsMutation = useUpdateUserSettings();
  const exportMutation = useExportBookmarks();
  const importMutation = useImportBookmarks();
  const clearDataMutation = useClearSyncData();
  
  // AI configuration hooks
  const { data: aiConfigData, isLoading: aiConfigLoading } = useAIConfig();
  const { data: aiHealthData, isLoading: aiHealthLoading } = useAIHealth();
  const updateAIConfigMutation = useUpdateAIConfig();
  
  const [settings, setSettings] = useState(user?.settings || {
    theme: 'system' as const,
    viewMode: 'grid' as const,
    autoSync: true,
    aiSuggestions: true,
  });
  
  const [aiConfig, setAiConfig] = useState({
    provider: 'openai' as const,
    model: 'gpt-3.5-turbo',
    enabled: true,
  });
  
  const [importFile, setImportFile] = useState<File | null>(null);

  // Update AI config when data is loaded
  useEffect(() => {
    if (aiConfigData?.data) {
      setAiConfig({
        provider: aiConfigData.data.provider,
        model: aiConfigData.data.model,
        enabled: aiConfigData.data.enabled,
      });
    }
  }, [aiConfigData]);

  const handleSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleSaveAIConfig = async () => {
    try {
      await updateAIConfigMutation.mutateAsync(aiConfig);
    } catch (error) {
      console.error('Failed to save AI config:', error);
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
    if (!confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
      return;
    }
    
    try {
      await clearDataMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to clear data:', error);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          設定
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          アプリケーションの動作をカスタマイズ
        </p>
      </div>

      <div className="space-y-6">
        {/* 表示設定 */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            表示設定
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                テーマ
              </label>
              <select
                value={settings.theme}
                onChange={(e) => setSettings({
                  ...settings,
                  theme: e.target.value as 'light' | 'dark' | 'system'
                })}
                className="input"
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="system">システム設定に従う</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                デフォルト表示モード
              </label>
              <select
                value={settings.viewMode}
                onChange={(e) => setSettings({
                  ...settings,
                  viewMode: e.target.value as 'grid' | 'list'
                })}
                className="input"
              >
                <option value="grid">グリッド</option>
                <option value="list">リスト</option>
              </select>
            </div>
          </div>
        </div>

        {/* 同期設定 */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            同期設定
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  自動同期
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  新しいブックマークを自動的に取得
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSync}
                  onChange={(e) => setSettings({
                    ...settings,
                    autoSync: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  AI提案機能
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  カテゴリとタグの自動提案
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.aiSuggestions}
                  onChange={(e) => setSettings({
                    ...settings,
                    aiSuggestions: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* AI設定 */}
        <div className="card p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Brain className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              AI機能設定
            </h3>
            {aiHealthData?.data && (
              <div className="flex items-center space-x-1">
                {aiHealthData.data.status === 'healthy' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {aiHealthData.data.status === 'disabled' && (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                {aiHealthData.data.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {aiHealthData.data.status}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  AI分析機能
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  コンテンツの自動分析とカテゴリ・タグ提案
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => setAiConfig({
                    ...aiConfig,
                    enabled: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {aiConfig.enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AIプロバイダー
                  </label>
                  <select
                    value={aiConfig.provider}
                    onChange={(e) => setAiConfig({
                      ...aiConfig,
                      provider: e.target.value as 'openai' | 'anthropic' | 'huggingface'
                    })}
                    className="input"
                    disabled={aiConfigLoading}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="huggingface" disabled>Hugging Face (未実装)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AIモデル
                  </label>
                  <select
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({
                      ...aiConfig,
                      model: e.target.value
                    })}
                    className="input"
                    disabled={aiConfigLoading}
                  >
                    {aiConfig.provider === 'openai' && (
                      <>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      </>
                    )}
                    {aiConfig.provider === 'anthropic' && (
                      <>
                        <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                        <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                        <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>注意:</strong> AI機能を使用するには適切なAPIキーが環境変数に設定されている必要があります。
                    管理者にお問い合わせください。
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAIConfig}
                    disabled={updateAIConfigMutation.isPending || aiConfigLoading}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {updateAIConfigMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {updateAIConfigMutation.isPending ? 'AI設定保存中...' : 'AI設定を保存'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* データ管理 */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            データ管理
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  データエクスポート
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  ブックマークデータをJSONまたはCSV形式でダウンロード
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleExport('json')}
                  disabled={exportMutation.isPending}
                  className="btn-secondary flex items-center space-x-2"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>JSON</span>
                </button>
                <button 
                  onClick={() => handleExport('csv')}
                  disabled={exportMutation.isPending}
                  className="btn-secondary flex items-center space-x-2"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  データインポート
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  他のサービスからブックマークデータをインポート
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
                  className="btn-secondary flex items-center space-x-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>ファイル選択</span>
                </label>
                {importFile && (
                  <button
                    onClick={handleImport}
                    disabled={importMutation.isPending}
                    className="btn-primary flex items-center space-x-2"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>インポート</span>
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-red-600 dark:text-red-400">
                    すべてのデータを削除
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    この操作は取り消せません
                  </div>
                </div>
                <button 
                  onClick={handleClearData}
                  disabled={clearDataMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  {clearDataMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>削除</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 保存ボタン */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={updateSettingsMutation.isPending}
            className="btn-primary flex items-center space-x-2"
          >
            {updateSettingsMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {updateSettingsMutation.isPending ? '保存中...' : '設定を保存'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;