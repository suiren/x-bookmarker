import { TrendingUp, BookOpen, Users, Clock } from 'lucide-react';
import { useBookmarks } from '../hooks/useBookmarks';
import { useCategories } from '../hooks/useCategories';
import { useSyncStats } from '../hooks/useSync';

const DashboardPage = () => {
  const { data: bookmarksData } = useBookmarks({ limit: 5 }); // Recent bookmarks
  const { data: categories = [] } = useCategories();
  const { data: syncStats } = useSyncStats();

  const recentBookmarks = bookmarksData?.data || [];
  const totalBookmarks = syncStats?.totalBookmarksImported || 0;

  // Dashboard stats
  const stats = [
    {
      name: '総ブックマーク数',
      value: totalBookmarks,
      icon: BookOpen,
      change: '+12%',
      changeType: 'increase' as const,
    },
    {
      name: 'カテゴリ数',
      value: categories.length,
      icon: TrendingUp,
      change: '+5%',
      changeType: 'increase' as const,
    },
    {
      name: '同期回数',
      value: syncStats?.totalSyncs || 0,
      icon: Clock,
      change: '+8%',
      changeType: 'increase' as const,
    },
    {
      name: '成功率',
      value: syncStats?.successfulSyncs && syncStats?.totalSyncs 
        ? `${Math.round((syncStats.successfulSyncs / syncStats.totalSyncs) * 100)}%`
        : '0%',
      icon: Users,
      change: '+2%',
      changeType: 'increase' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          ダッシュボード
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          ブックマークの概要と最近のアクティビティ
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="card p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Icon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="ml-4 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      {stat.name}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                        {stat.value}
                      </div>
                      <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                        {stat.change}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookmarks */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            最近のブックマーク
          </h3>
          <div className="space-y-4">
            {recentBookmarks.length > 0 ? (
              recentBookmarks.map((bookmark) => (
                <div key={bookmark.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {bookmark.authorAvatarUrl ? (
                      <img
                        src={bookmark.authorAvatarUrl}
                        alt={bookmark.authorDisplayName}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      @{bookmark.authorUsername}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {bookmark.content}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                まだブックマークがありません
              </p>
            )}
          </div>
        </div>

        {/* Category Overview */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            カテゴリ別ブックマーク数
          </h3>
          <div className="space-y-3">
            {categories.length > 0 ? (
              categories.slice(0, 6).map((category) => (
                <div key={category.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {category.name}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    -
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                カテゴリが設定されていません
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;