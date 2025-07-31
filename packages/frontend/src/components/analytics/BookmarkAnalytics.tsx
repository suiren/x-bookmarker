import React, { useMemo } from 'react';
import { BarChart3, PieChart, TrendingUp, Calendar, Tag, User, BookOpen } from 'lucide-react';
import { useBookmarks } from '../../hooks/useBookmarks';
import { useCategories } from '../../hooks/useCategories';

interface AnalyticsData {
  totalBookmarks: number;
  categoriesDistribution: Array<{ name: string; count: number; color: string }>;
  monthlyGrowth: Array<{ month: string; count: number; cumulative: number }>;
  topTags: Array<{ tag: string; count: number }>;
  topAuthors: Array<{ username: string; displayName: string; count: number }>;
  dailyActivity: Array<{ day: string; count: number }>;
}

export const BookmarkAnalytics: React.FC = () => {
  const { data: bookmarks = [] } = useBookmarks();
  const { data: categories = [] } = useCategories();

  const analyticsData: AnalyticsData = useMemo(() => {
    // カテゴリ別分布
    const categoryMap = new Map(categories.map(cat => [cat.id, { name: cat.name, color: cat.color }]));
    const categoryCounts = new Map<string, number>();
    
    bookmarks.forEach(bookmark => {
      const categoryId = bookmark.categoryId || 'uncategorized';
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
    });

    const categoriesDistribution = Array.from(categoryCounts.entries()).map(([id, count]) => ({
      name: categoryMap.get(id)?.name || '未分類',
      count,
      color: categoryMap.get(id)?.color || '#6B7280',
    })).sort((a, b) => b.count - a.count);

    // 月別成長率
    const monthlyData = new Map<string, number>();
    bookmarks.forEach(bookmark => {
      const month = new Date(bookmark.bookmarkedAt).toLocaleDateString('ja-JP', { 
        year: 'numeric', 
        month: 'short' 
      });
      monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
    });

    const sortedMonths = Array.from(monthlyData.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

    let cumulative = 0;
    const monthlyGrowth = sortedMonths.map(([month, count]) => {
      cumulative += count;
      return { month, count, cumulative };
    });

    // トップタグ
    const tagCounts = new Map<string, number>();
    bookmarks.forEach(bookmark => {
      bookmark.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // トップ作者
    const authorCounts = new Map<string, { displayName: string; count: number }>();
    bookmarks.forEach(bookmark => {
      const username = bookmark.authorUsername;
      const existing = authorCounts.get(username);
      authorCounts.set(username, {
        displayName: existing?.displayName || bookmark.authorDisplayName,
        count: (existing?.count || 0) + 1,
      });
    });

    const topAuthors = Array.from(authorCounts.entries())
      .map(([username, data]) => ({ username, displayName: data.displayName, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 曜日別活動
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayCounts = new Map<number, number>();
    bookmarks.forEach(bookmark => {
      const day = new Date(bookmark.bookmarkedAt).getDay();
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    });

    const dailyActivity = dayNames.map((day, index) => ({
      day,
      count: dayCounts.get(index) || 0,
    }));

    return {
      totalBookmarks: bookmarks.length,
      categoriesDistribution,
      monthlyGrowth,
      topTags,
      topAuthors,
      dailyActivity,
    };
  }, [bookmarks, categories]);

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                総ブックマーク数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData.totalBookmarks.toLocaleString()}
              </p>
            </div>
            <BookOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                カテゴリ数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData.categoriesDistribution.length}
              </p>
            </div>
            <PieChart className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                ユニークタグ数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData.topTags.length}
              </p>
            </div>
            <Tag className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                フォロー作者数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {analyticsData.topAuthors.length}
              </p>
            </div>
            <User className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* カテゴリ分布 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              カテゴリ別分布
            </h3>
          </div>
          <div className="space-y-3">
            {analyticsData.categoriesDistribution.map((category, index) => {
              const percentage = (category.count / analyticsData.totalBookmarks) * 100;
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {category.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{ 
                          backgroundColor: category.color,
                          width: `${percentage}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white w-12">
                      {category.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 月別成長 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              月別ブックマーク数
            </h3>
          </div>
          <div className="space-y-2">
            {analyticsData.monthlyGrowth.slice(-6).map((month, index) => {
              const maxCount = Math.max(...analyticsData.monthlyGrowth.map(m => m.count));
              const percentage = (month.count / maxCount) * 100;
              return (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-16">
                    {month.month}
                  </span>
                  <div className="flex-1 mx-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-8">
                    {month.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* トップタグ */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              人気タグ
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {analyticsData.topTags.slice(0, 15).map((tag, index) => {
              const size = Math.min(16, 12 + (tag.count / analyticsData.topTags[0]?.count || 1) * 4);
              return (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium"
                  style={{ fontSize: `${size}px` }}
                >
                  #{tag.tag} ({tag.count})
                </span>
              );
            })}
          </div>
        </div>

        {/* トップ作者 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              よくブックマークする作者
            </h3>
          </div>
          <div className="space-y-2">
            {analyticsData.topAuthors.slice(0, 8).map((author, index) => {
              const maxCount = analyticsData.topAuthors[0]?.count || 1;
              const percentage = (author.count / maxCount) * 100;
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-4">
                      #{index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {author.displayName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        @{author.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-orange-600 dark:bg-orange-400 h-1.5 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white w-6">
                      {author.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 曜日別活動 */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            曜日別ブックマーク活動
          </h3>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {analyticsData.dailyActivity.map((day, index) => {
            const maxCount = Math.max(...analyticsData.dailyActivity.map(d => d.count));
            const intensity = maxCount > 0 ? (day.count / maxCount) : 0;
            const opacity = Math.max(0.1, intensity);
            
            return (
              <div key={index} className="text-center">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {day.day}
                </div>
                <div
                  className="w-full h-16 rounded-lg bg-indigo-600 dark:bg-indigo-400 flex items-end justify-center"
                  style={{ opacity }}
                >
                  <span className="text-xs font-medium text-white mb-1">
                    {day.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};