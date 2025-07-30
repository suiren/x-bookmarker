/**
 * データ統計パネル
 * データ使用量と統計情報の表示
 */

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  HardDrive,
  Users,
  FileText,
  Folder,
  Tag,
  Search,
  BarChart3,
  PieChart,
  TrendingUp,
  Calendar,
  Clock,
  RefreshCw,
  Download
} from 'lucide-react';
import { format, subDays, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';

interface DatabaseStats {
  users: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  bookmarks: {
    total: number;
    thisMonth: number;
    averagePerUser: number;
  };
  categories: {
    total: number;
    mostUsed: Array<{ name: string; count: number }>;
  };
  tags: {
    total: number;
    mostUsed: Array<{ name: string; count: number }>;
  };
  searchHistory: {
    total: number;
    thisWeek: number;
  };
}

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  totalSizeMB: number;
  provider: string;
  breakdown: Record<string, { count: number; size: number }>;
}

interface UsageStats {
  daily: Array<{ date: string; bookmarks: number; searches: number }>;
  categoryDistribution: Array<{ name: string; count: number; percentage: number }>;
  userActivity: Array<{ period: string; activeUsers: number; newBookmarks: number }>;
}

export const DataStatsPanel: React.FC = () => {
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadStats();
  }, [selectedPeriod]);

  const loadStats = async () => {
    setLoading(true);
    
    try {
      const [dbRes, storageRes] = await Promise.all([
        fetch('/api/stats/database', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/files/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (dbRes.ok) {
        const dbData = await dbRes.json();
        setDatabaseStats(dbData);
      }

      if (storageRes.ok) {
        const storageData = await storageRes.json();
        setStorageStats(storageData);
      }

      // 使用統計のモックデータ（実際の実装では適切なAPIから取得）
      generateUsageStats();
      
    } catch (error) {
      console.error('統計データ読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateUsageStats = () => {
    const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
    const daily = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      daily.push({
        date: format(date, 'MM/dd'),
        bookmarks: Math.floor(Math.random() * 50) + 10,
        searches: Math.floor(Math.random() * 30) + 5,
      });
    }

    const categoryDistribution = [
      { name: '技術・AI', count: 450, percentage: 32 },
      { name: '趣味・ゲーム', count: 320, percentage: 23 },
      { name: '料理・レシピ', count: 280, percentage: 20 },
      { name: '読書・書籍', count: 200, percentage: 14 },
      { name: 'その他', count: 150, percentage: 11 },
    ];

    const periods = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 4 : 12;
    const userActivity = [];
    
    for (let i = periods - 1; i >= 0; i--) {
      const period = selectedPeriod === '7d' 
        ? format(subDays(new Date(), i), 'MM/dd')
        : selectedPeriod === '30d'
        ? `第${4-i}週`
        : format(subMonths(new Date(), i), 'yyyy/MM');
        
      userActivity.push({
        period,
        activeUsers: Math.floor(Math.random() * 50) + 20,
        newBookmarks: Math.floor(Math.random() * 200) + 50,
      });
    }

    setUsageStats({ daily, categoryDistribution, userActivity });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const exportStats = async () => {
    try {
      const response = await fetch('/api/stats/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          format: 'json',
          period: selectedPeriod,
          includeUserStats: true,
          includeStorageStats: true,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `stats-${format(new Date(), 'yyyy-MM-dd')}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('統計エクスポートエラー:', error);
      alert('エクスポートに失敗しました');
    }
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
      {/* ヘッダーとコントロール */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="7d">過去7日間</option>
            <option value="30d">過去30日間</option>
            <option value="90d">過去90日間</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
          <button
            onClick={exportStats}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            エクスポート
          </button>
        </div>
      </div>

      {/* 概要統計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {databaseStats?.users.total || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">ユーザー数</p>
              {databaseStats?.users.newThisMonth && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  今月 +{databaseStats.users.newThisMonth}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {databaseStats?.bookmarks.total.toLocaleString() || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">ブックマーク数</p>
              {databaseStats?.bookmarks.thisMonth && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  今月 +{databaseStats.bookmarks.thisMonth}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {storageStats?.totalSizeMB.toFixed(1) || 0} MB
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">ストレージ使用量</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {storageStats?.totalFiles || 0} ファイル
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <Search className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {databaseStats?.searchHistory.total || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">検索クエリ数</p>
              {databaseStats?.searchHistory.thisWeek && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  今週 +{databaseStats.searchHistory.thisWeek}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 使用統計グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 日別アクティビティ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                日別アクティビティ
              </h3>
            </div>
            
            {usageStats && (
              <div className="space-y-3">
                {usageStats.daily.slice(-7).map((day, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {day.date}
                    </span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {day.bookmarks} ブックマーク
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {day.searches} 検索
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* カテゴリ分布 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                カテゴリ分布
              </h3>
            </div>
            
            {usageStats && (
              <div className="space-y-3">
                {usageStats.categoryDistribution.map((category, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {category.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {category.count} ({category.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${category.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 詳細統計 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 人気タグ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                人気タグ
              </h3>
            </div>
            
            {databaseStats?.tags.mostUsed && (
              <div className="space-y-2">
                {databaseStats.tags.mostUsed.slice(0, 10).map((tag, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      #{tag.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {tag.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ストレージ内訳 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                ストレージ内訳
              </h3>
            </div>
            
            {storageStats?.breakdown && (
              <div className="space-y-3">
                {Object.entries(storageStats.breakdown).map(([category, data]) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {category}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {data.count} ファイル • {formatFileSize(data.size)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min((data.size / storageStats.totalSize) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* システム情報 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              システム情報
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">データベース</p>
              <div className="space-y-1 text-gray-500 dark:text-gray-400">
                <p>総テーブル数: {databaseStats ? '8' : '0'}</p>
                <p>総レコード数: {databaseStats ? (
                  databaseStats.users.total + 
                  databaseStats.bookmarks.total + 
                  databaseStats.categories.total
                ).toLocaleString() : '0'}</p>
                <p>平均ブックマーク/ユーザー: {databaseStats?.bookmarks.averagePerUser.toFixed(1) || '0'}</p>
              </div>
            </div>
            
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">ストレージ</p>
              <div className="space-y-1 text-gray-500 dark:text-gray-400">
                <p>プロバイダー: {storageStats?.provider || 'Unknown'}</p>
                <p>総ファイル数: {storageStats?.totalFiles.toLocaleString() || '0'}</p>
                <p>使用量: {storageStats ? formatFileSize(storageStats.totalSize) : '0 B'}</p>
              </div>
            </div>
            
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">アクティビティ</p>
              <div className="space-y-1 text-gray-500 dark:text-gray-400">
                <p>アクティブユーザー: {databaseStats?.users.active || '0'}</p>
                <p>総検索数: {databaseStats?.searchHistory.total.toLocaleString() || '0'}</p>
                <p>最終更新: {format(new Date(), 'yyyy/MM/dd HH:mm', { locale: ja })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};