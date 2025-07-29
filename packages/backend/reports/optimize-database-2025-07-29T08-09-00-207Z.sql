-- データベースパフォーマンス最適化SQL
-- 生成日時: 2025-07-29T08:09:00.207Z

-- =====================================================
-- Phase 1: 基本インデックス作成
-- =====================================================

-- ブックマーク基本インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_bookmarked 
ON bookmarks(user_id, bookmarked_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_archived 
ON bookmarks(user_id, is_archived);

-- 全文検索インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_search_vector 
ON bookmarks USING gin(search_vector);

-- タグ検索インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_tags 
ON bookmarks USING gin(tags);

-- カテゴリインデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_user 
ON categories(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_category_user 
ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;

-- 検索履歴インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_history_user_created 
ON search_history(user_id, created_at DESC);

-- =====================================================
-- インデックス作成状況確認
-- =====================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('bookmarks', 'categories', 'search_history')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
