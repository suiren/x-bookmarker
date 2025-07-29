# データベースパフォーマンス分析レポート

**分析日時**: 2025-07-29T08:09:00.203Z
**分析対象**: 主要なデータベースクエリ 5件

## 🚨 優先度の高い最適化項目

1. **ブックマーク一覧取得の最適化**
   - `(user_id, bookmarked_at DESC)` 複合インデックス作成
   - 10,000件以上のブックマークで顕著な改善効果

2. **全文検索の最適化**
   - `search_vector` GINインデックスの最適化
   - インデックス更新の並列化

3. **タグ検索の最適化**
   - `tags` 配列用GINインデックス作成
   - 配列操作の効率化

## 📊 クエリ別詳細分析

### 1. ブックマーク一覧取得

ユーザーのブックマーク一覧を日付順で取得

**現在の実装**:
```sql
SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.is_archived = FALSE
      ORDER BY b.bookmarked_at DESC
      LIMIT 20 OFFSET 0
```

**潜在的な問題**:
- ユーザーが大量のブックマークを持つ場合、ORDER BYが遅くなる可能性
- LEFT JOINによる不要なデータ取得の可能性

**最適化提案**:
- (user_id, bookmarked_at)の複合インデックスを追加
- カテゴリ情報が不要な場合はJOINを除去
- SELECT *を避けて必要なカラムのみ選択

**推奨インデックス**:
```sql
CREATE INDEX idx_bookmarks_user_bookmarked ON bookmarks(user_id, bookmarked_at DESC);
CREATE INDEX idx_bookmarks_user_archived ON bookmarks(user_id, is_archived);
```

### 2. 全文検索

ブックマークの全文検索とファセット検索

**現在の実装**:
```sql
SELECT b.*, c.name as category_name,
             ts_rank(b.search_vector, plainto_tsquery('english_unaccent', $2)) as relevance_score
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 
        AND b.search_vector @@ plainto_tsquery('english_unaccent', $2)
        AND b.is_archived = FALSE
      ORDER BY relevance_score DESC, b.bookmarked_at DESC
```

**潜在的な問題**:
- search_vectorのGINインデックスが最適化されていない可能性
- ts_rankの計算がCPU集約的
- 複数の条件を組み合わせた場合のパフォーマンス劣化

**最適化提案**:
- search_vector専用のGINインデックスを最適化
- ts_rank_cdを使用してより高速なランキング計算を検討
- search_vectorの更新をバックグラウンドで実行

**推奨インデックス**:
```sql
CREATE INDEX idx_bookmarks_search_vector ON bookmarks USING gin(search_vector);
CREATE INDEX idx_bookmarks_user_search ON bookmarks(user_id) WHERE search_vector IS NOT NULL;
```

### 3. タグ検索

タグによるブックマーク絞り込み

**現在の実装**:
```sql
SELECT b.*, c.name as category_name
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.tags && $2 AND b.is_archived = FALSE
      ORDER BY b.bookmarked_at DESC
```

**潜在的な問題**:
- tags配列検索でGINインデックスが使われていない可能性
- 複数タグの組み合わせ検索で性能劣化

**最適化提案**:
- tagsカラム用のGINインデックスを追加
- よく使われるタグの組み合わせをマテリアライズドビューで事前計算

**推奨インデックス**:
```sql
CREATE INDEX idx_bookmarks_tags ON bookmarks USING gin(tags);
CREATE INDEX idx_bookmarks_user_tags ON bookmarks(user_id) WHERE array_length(tags, 1) > 0;
```

### 4. カテゴリ集計

ファセット検索用のカテゴリ別ブックマーク数集計

**現在の実装**:
```sql
SELECT c.id, c.name, c.color, c.icon, COUNT(b.id) as count
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id 
        AND b.user_id = $1 AND b.is_archived = FALSE
      WHERE c.user_id = $1
      GROUP BY c.id, c.name, c.color, c.icon
      HAVING COUNT(b.id) > 0
      ORDER BY count DESC, c.name ASC
```

**潜在的な問題**:
- ユーザーの全カテゴリをスキャンしてからブックマーク数を計算
- COUNT(*)が大量データで遅くなる可能性

**最適化提案**:
- カテゴリ別ブックマーク数をキャッシュ
- マテリアライズドビューまたはカウンターテーブルの導入
- Redis等でカテゴリ統計をキャッシュ

**推奨インデックス**:
```sql
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_bookmarks_category_user ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;
```

### 5. 検索履歴

ユーザーの検索履歴取得

**現在の実装**:
```sql
SELECT id, query, result_count, execution_time, created_at
      FROM search_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20 OFFSET 0
```

**潜在的な問題**:
- 検索履歴が増えすぎた場合のORDER BY性能
- 古い履歴の自動削除機能がない

**最適化提案**:
- (user_id, created_at)複合インデックス追加
- 定期的な古い履歴の削除バッチジョブ
- 履歴の最大保存期間を設定

**推奨インデックス**:
```sql
CREATE INDEX idx_search_history_user_created ON search_history(user_id, created_at DESC);
```

## 🎯 統合的な最適化戦略

### Phase 1: 基本インデックス作成（即座に実行可能）
```sql
-- ブックマーク基本インデックス
CREATE INDEX CONCURRENTLY idx_bookmarks_user_bookmarked ON bookmarks(user_id, bookmarked_at DESC);
CREATE INDEX CONCURRENTLY idx_bookmarks_user_archived ON bookmarks(user_id, is_archived);

-- 全文検索インデックス
CREATE INDEX CONCURRENTLY idx_bookmarks_search_vector ON bookmarks USING gin(search_vector);

-- タグ検索インデックス
CREATE INDEX CONCURRENTLY idx_bookmarks_tags ON bookmarks USING gin(tags);

-- カテゴリインデックス
CREATE INDEX CONCURRENTLY idx_categories_user ON categories(user_id);
CREATE INDEX CONCURRENTLY idx_bookmarks_category_user ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;

-- 検索履歴インデックス
CREATE INDEX CONCURRENTLY idx_search_history_user_created ON search_history(user_id, created_at DESC);
```

### Phase 2: キャッシュ戦略実装
- Redis によるクエリ結果キャッシング
- カテゴリ別統計情報のキャッシュ
- 検索結果の時限付きキャッシュ

### Phase 3: 高度な最適化
- マテリアライズドビューの導入
- パーティショニングの検討
- read replica の活用

## 📈 パフォーマンス目標

| 操作 | 現在の目標 | 最適化後の目標 |
|------|-----------|---------------|
| ブックマーク一覧取得 | < 500ms | < 100ms |
| 全文検索 | < 1000ms | < 300ms |
| タグ検索 | < 500ms | < 100ms |
| カテゴリ集計 | < 500ms | < 50ms |
| 検索履歴取得 | < 200ms | < 50ms |

## 🔍 監視すべき項目

1. **クエリ実行時間**
   - 各APIエンドポイントのレスポンス時間
   - データベースクエリ実行時間

2. **インデックス使用状況**
   - `pg_stat_user_indexes` でのインデックス統計
   - 未使用インデックスの検出

3. **リソース使用量**
   - CPU使用率
   - メモリ使用量
   - ディスクI/O

## 🛠️ 次のアクション

1. **即座に実行**: Phase 1 のインデックス作成
2. **今週中**: Redis キャッシング実装
3. **来週**: パフォーマンステストの実施
4. **継続的**: 監視ダッシュボードの確認