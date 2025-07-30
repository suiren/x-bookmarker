/**
 * データ管理ページ
 * エクスポート・インポート・バックアップ機能のメインUI
 */

import React, { useState } from 'react';
import { 
  Download, 
  Upload, 
  Archive, 
  FileText, 
  Database,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { ExportPanel } from '../components/dataManagement/ExportPanel';
import { ImportPanel } from '../components/dataManagement/ImportPanel';
import { BackupPanel } from '../components/dataManagement/BackupPanel';
import { DataStatsPanel } from '../components/dataManagement/DataStatsPanel';

type TabType = 'export' | 'import' | 'backup' | 'stats';

const DataManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('export');

  const tabs = [
    {
      id: 'export' as TabType,
      label: 'エクスポート',
      icon: Download,
      description: 'データを外部ファイルに出力'
    },
    {
      id: 'import' as TabType,
      label: 'インポート',
      icon: Upload,
      description: '他のサービスからデータを取り込み'
    },
    {
      id: 'backup' as TabType,
      label: 'バックアップ',
      icon: Archive,
      description: '自動バックアップの管理'
    },
    {
      id: 'stats' as TabType,
      label: '統計情報',
      icon: Database,
      description: 'データ使用量と統計'
    }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'export':
        return <ExportPanel />;
      case 'import':
        return <ImportPanel />;
      case 'backup':
        return <BackupPanel />;
      case 'stats':
        return <DataStatsPanel />;
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* ページヘッダー */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              データ管理
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            ブックマークデータのエクスポート、インポート、バックアップを管理します。
          </p>
        </div>

        {/* 注意事項バナー */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-blue-800 dark:text-blue-200 font-medium mb-1">
                データ管理について
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                エクスポート・インポート操作は時間がかかる場合があります。
                大量のデータを扱う際は、進捗状況を確認しながら操作してください。
              </p>
            </div>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
          <div className="flex flex-wrap border-b border-gray-200 dark:border-gray-700">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors relative ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  
                  {/* モバイル用の説明テキスト */}
                  <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 ml-1">
                    - {tab.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* タブコンテンツ */}
        <div className="min-h-96">
          {renderTabContent()}
        </div>

        {/* フッター情報 */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">サポート形式</p>
                <p>JSON, CSV, Chrome, Firefox, ZIP</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">自動バックアップ</p>
                <p>日次・週次・月次スケジュール対応</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">セキュリティ</p>
                <p>暗号化された安全なファイル転送</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DataManagementPage;