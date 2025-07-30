# SearchService 実装ガイド

このドキュメントでは、SearchServiceクラスの実装について、コードの詳細と設計パターンを解説します。

## SearchServiceクラス概要

SearchServiceは、X Bookmarkerの検索機能の中核を担うサービスクラスです。PostgreSQLの全文検索機能を活用し、高度な検索機能を提供します。

```typescript
class SearchService {
  constructor(private db: Pool) {}
  
  // 主要メソッド
  async search(userId: string, query: SearchQuery, includeFacets: boolean = true): Promise<SearchResult>
  async getSearchSuggestions(userId: string, queryText: string, limit: number = 10)
  async getSearchAnalytics(userId: string, days: number = 30)
  async saveToHistory(userId: string, query: SearchQuery, resultCount: number, executionTime: number)
}
```

## コンストラクタパターン

### 依存性注入を使用した設計

```typescript
class SearchService {
  constructor(private db: Pool) {}
}
```

**なぜこの設計？**
- **テスタビリティ**: モックデータベースを注入してテストが容易
- **疎結合**: データベース実装の詳細から分離
- **再利用性**: 異なるデータベース接続で同じサービスを利用可能

## 主要メソッドの詳細実装

### 1. search()メソッド - 高度検索の実装

```typescript
async search(userId: string, query: SearchQuery, includeFacets: boolean = true): Promise<SearchResult> {
  const startTime = Date.now();
  
  // 1. 検索クエリの構築
  const searchQueryBuilder = this.buildSearchQuery(userId, query);
  
  // 2. メイン検索の実行
  const searchResult = await this.db.query(
    searchQueryBuilder.query + ` LIMIT $${searchQueryBuilder.paramIndex} OFFSET $${searchQueryBuilder.paramIndex + 1}`,
    [...searchQueryBuilder.params, query.limit, query.offset]
  );
  
  // 3. 総件数の取得
  const countQuery = searchQueryBuilder.query
    .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
    .replace(/ORDER BY[\s\S]*$/, '');
    
  const countResult = await this.db.query(countQuery, searchQueryBuilder.params);
  const totalCount = parseInt(countResult.rows[0].count);
  
  // 4. ファセットデータの構築（オプション）
  let facets: SearchFacets | undefined;
  if (includeFacets) {
    facets = await this.buildFacets(userId, query);
  }
  
  const executionTime = Date.now() - startTime;
  
  return {
    bookmarks: searchResult.rows.map(this.formatBookmark),
    totalCount,
    facets,
    executionTime,
  };
}
```

**実装のポイント：**

#### パフォーマンス測定
```typescript
const startTime = Date.now();
// ... 処理 ...
const executionTime = Date.now() - startTime;
```
検索時間を測定することで、パフォーマンス監視とデバッグが容易になります。

#### 効率的な件数取得
```typescript
const countQuery = searchQueryBuilder.query
  .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
  .replace(/ORDER BY[\s\S]*$/, '');
```
メインクエリからCOUNTクエリを生成することで、条件を重複定義することなく総件数を取得します。

### 2. buildSearchQuery()メソッド - 動的SQLクエリ構築

```typescript
private buildSearchQuery(userId: string, query: SearchQuery) {
  let searchQuery = `
    SELECT 
      b.id, b.x_tweet_id, b.content,
      b.author_username, b.author_display_name,
      c.name as category_name, c.color as category_color,
      ${query.text ? 'ts_rank(b.search_vector, plainto_tsquery(\\'english_unaccent\\', $1)) as relevance_score' : '0 as relevance_score'}
    FROM bookmarks b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = $${query.text ? '2' : '1'}
  `;
  
  const params: any[] = [];
  let paramIndex = 1;
  
  // テキスト検索パラメータを最初に追加
  if (query.text) {
    params.push(query.text);
    paramIndex++;
  }
  
  // ユーザーIDパラメータを追加
  params.push(userId);
  paramIndex++;
  
  // 動的フィルタの追加
  if (query.text) {
    searchQuery += ` AND b.search_vector @@ plainto_tsquery('english_unaccent', $1)`;
  }
  
  if (query.categoryIds && query.categoryIds.length > 0) {
    searchQuery += ` AND b.category_id = ANY($${paramIndex})`;
    params.push(query.categoryIds);
    paramIndex++;
  }
  
  // ... その他のフィルタ
  
  return { query: searchQuery, params, paramIndex };
}
```

**設計パターンの解説：**

#### 1. パラメータ化クエリの安全な構築
```typescript
const params: any[] = [];
let paramIndex = 1;

// パラメータを順番に追加
if (query.text) {
  params.push(query.text);
  paramIndex++;
}
```

この方法により：
- **SQLインジェクション攻撃を防止**
- **パラメータの順序を適切に管理**
- **動的な条件追加が安全**

#### 2. 条件分岐による動的クエリ構築
```typescript
if (query.categoryIds && query.categoryIds.length > 0) {
  searchQuery += ` AND b.category_id = ANY($${paramIndex})`;
  params.push(query.categoryIds);
  paramIndex++;
}
```

各フィルタ条件をオプションとして動的に追加することで、柔軟な検索機能を実現しています。

### 3. buildFacets()メソッド - ファセット検索の実装

```typescript
private async buildFacets(userId: string, query: SearchQuery): Promise<SearchFacets> {
  const baseConditions = this.buildBaseConditions(userId, query);
  
  // カテゴリファセット
  const categoryFacetQuery = `
    SELECT 
      c.id, c.name, c.color, c.icon,
      COUNT(b.id) as count
    FROM categories c
    LEFT JOIN bookmarks b ON c.id = b.category_id 
      AND b.user_id = $1 
      AND b.is_archived = FALSE
      ${baseConditions.textCondition}
    WHERE c.user_id = $1
    GROUP BY c.id, c.name, c.color, c.icon
    HAVING COUNT(b.id) > 0
    ORDER BY count DESC, c.name ASC
    LIMIT 20
  `;
  
  const categoryFacets = await this.db.query(categoryFacetQuery, baseConditions.params);
  
  // タグファセット
  const tagFacetQuery = `
    SELECT tag, COUNT(*) as count
    FROM (
      SELECT UNNEST(tags) as tag
      FROM bookmarks b
      WHERE b.user_id = $1 
        AND b.is_archived = FALSE
        ${baseConditions.textCondition}
    ) tag_list
    WHERE tag IS NOT NULL AND tag != ''
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT 20
  `;
  
  // ... 作者ファセット
  
  return {
    categories: categoryFacets.rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      count: parseInt(row.count)
    })),
    // ... その他のファセット
  };
}
```

**ファセット検索の技術的ポイント：**

#### 1. UNNEST関数を使用したタグ展開
```sql
SELECT UNNEST(tags) as tag FROM bookmarks
```
PostgreSQLのUNNEST関数で配列を行に展開し、個々のタグの出現回数を集計します。

#### 2. LEFT JOINによる効率的な集計
```sql
LEFT JOIN bookmarks b ON c.id = b.category_id 
  AND b.user_id = $1 
  AND b.is_archived = FALSE
```
LEFT JOINを使用することで、ブックマークが存在しないカテゴリも含めて適切に集計されます。

### 4. getSearchSuggestions()メソッド - オートコンプリート機能

```typescript
async getSearchSuggestions(userId: string, queryText: string, limit: number = 10): Promise<{
  tags: string[];
  authors: string[];
  categories: string[];
}> {
  const searchTerm = `%${queryText.toLowerCase()}%`;
  
  // タグ候補
  const tagSuggestions = await this.db.query(`
    SELECT DISTINCT tag, COUNT(*) as usage_count
    FROM (
      SELECT UNNEST(tags) as tag
      FROM bookmarks
      WHERE user_id = $1 AND is_archived = FALSE
    ) tag_list
    WHERE LOWER(tag) LIKE $2
    GROUP BY tag
    ORDER BY usage_count DESC, tag ASC
    LIMIT $3
  `, [userId, searchTerm, limit]);
  
  // 作者候補
  const authorSuggestions = await this.db.query(`
    SELECT DISTINCT author_display_name, COUNT(*) as usage_count
    FROM bookmarks
    WHERE user_id = $1 
      AND is_archived = FALSE
      AND LOWER(author_display_name) LIKE $2
    GROUP BY author_display_name
    ORDER BY usage_count DESC, author_display_name ASC
    LIMIT $3
  `, [userId, searchTerm, limit]);
  
  return {
    tags: tagSuggestions.rows.map(row => row.tag),
    authors: authorSuggestions.rows.map(row => row.author_display_name),
    categories: categorySuggestions.rows.map(row => row.name),
  };
}
```

**オートコンプリート機能の特徴：**

#### 1. 使用頻度による順序付け
```sql
ORDER BY usage_count DESC, tag ASC
```
利用頻度の高い候補を優先し、同じ頻度の場合はアルファベット順で表示します。

#### 2. 部分一致検索
```sql
WHERE LOWER(tag) LIKE $2
```
大文字小文字を区別しない部分一致で、ユーザーフレンドリーな候補を提供します。

### 5. getSearchAnalytics()メソッド - 検索分析機能

```typescript
async getSearchAnalytics(userId: string, days: number = 30): Promise<{
  totalSearches: number;
  avgExecutionTime: number;
  mostSearchedTerms: { query: string; count: number }[];
  searchTrends: { date: string; count: number }[];
}> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  
  // 統計情報の取得
  const statsResult = await this.db.query(`
    SELECT 
      COUNT(*) as total_searches,
      AVG(execution_time) as avg_execution_time
    FROM search_history
    WHERE user_id = $1 AND created_at >= $2
  `, [userId, fromDate]);
  
  // 人気検索語の取得（JSONBクエリ）
  const termsResult = await this.db.query(`
    SELECT 
      query->>'text' as search_term,
      COUNT(*) as count
    FROM search_history
    WHERE user_id = $1 
      AND created_at >= $2
      AND query->>'text' IS NOT NULL
      AND query->>'text' != ''
    GROUP BY query->>'text'
    ORDER BY count DESC
    LIMIT 10
  `, [userId, fromDate]);
  
  // 検索トレンドの取得
  const trendsResult = await this.db.query(`
    SELECT 
      DATE(created_at) as search_date,
      COUNT(*) as count
    FROM search_history
    WHERE user_id = $1 AND created_at >= $2
    GROUP BY DATE(created_at)
    ORDER BY search_date ASC
  `, [userId, fromDate]);
  
  return {
    totalSearches: parseInt(statsResult.rows[0]?.total_searches || '0'),
    avgExecutionTime: parseFloat(statsResult.rows[0]?.avg_execution_time || '0'),
    mostSearchedTerms: termsResult.rows.map(row => ({
      query: row.search_term,
      count: parseInt(row.count)
    })),
    searchTrends: trendsResult.rows.map(row => ({
      date: row.search_date,
      count: parseInt(row.count)
    })),
  };
}
```

**分析機能の技術的特徴：**

#### 1. JSONBクエリの活用
```sql
query->>'text' as search_term
```
PostgreSQLのJSONB演算子を使用して、JSON形式で保存された検索クエリから特定の値を抽出します。

#### 2. 日付集計によるトレンド分析
```sql
DATE(created_at) as search_date,
COUNT(*) as count
```
日付ごとの検索回数を集計し、時系列データとしてトレンドを可視化できます。

## エラーハンドリングとログ出力

```typescript
try {
  const searchResult = await searchService.search(req.user.userId, query, includeFacets);
  // 成功時の処理
} catch (error) {
  console.error('❌ Search error:', error);
  res.status(500).json({
    success: false,
    error: 'Search failed',
    code: 'SEARCH_ERROR',
  });
}
```

**エラーハンドリングのベストプラクティス：**

1. **構造化されたエラーレスポンス**: `success`、`error`、`code`の統一フォーマット
2. **適切なHTTPステータスコード**: エラーの種類に応じた適切なコード
3. **ログ出力**: デバッグとモニタリングのための詳細なログ
4. **ユーザーフレンドリーなメッセージ**: 技術的詳細を隠した分かりやすいエラーメッセージ

## テストのための設計パターン

```typescript
// テスト用のモックデータベース
const mockDb = {
  query: jest.fn()
};

const searchService = new SearchService(mockDb as any);

// テストケース
test('search should return formatted results', async () => {
  mockDb.query.mockResolvedValueOnce({
    rows: [/* テストデータ */]
  });
  
  const result = await searchService.search('user-id', {
    text: 'test',
    limit: 10,
    offset: 0
  });
  
  expect(result.bookmarks).toHaveLength(1);
  expect(mockDb.query).toHaveBeenCalledWith(/* 期待されるクエリ */);
});
```

## パフォーマンス最適化のヒント

### 1. インデックスの活用
```sql
-- 複合インデックスの例
CREATE INDEX idx_bookmarks_user_archived_date 
ON bookmarks(user_id, is_archived, bookmarked_at DESC);
```

### 2. クエリの最適化
```typescript
// 不要な結合を避ける
if (!includeFacets) {
  // ファセット用のJOINを実行しない
}
```

### 3. 結果のキャッシュ化
```typescript
// Redis等を使用した結果キャッシュ（将来の拡張）
const cacheKey = `search:${userId}:${JSON.stringify(query)}`;
```

## まとめ

SearchServiceは、以下の設計原則に基づいて実装されています：

- **単一責任の原則**: 検索機能のみに特化
- **依存性注入**: テスタブルで疎結合な設計
- **エラーハンドリング**: 適切なエラー処理と情報提供
- **パフォーマンス**: 効率的なデータベースクエリ
- **拡張性**: 新しい検索機能を追加しやすい構造

このサービスクラスを理解することで、X Bookmarkerの検索機能をカスタマイズし、さらなる機能拡張を行うことができます。

---

> 💡 **次のステップ**: [検索API リファレンス](./search-api-reference.md)で具体的なAPI使用方法を学習してください。