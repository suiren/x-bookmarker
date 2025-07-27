# ブックマークAPI実装ガイド

このドキュメントでは、X Bookmarkerのブックマーク管理APIの実装詳細を解説し、開発者がAPIを効果的に使用するための実践的なガイドを提供します。

## 目次

1. [API概要](#api概要)
2. [認証とセキュリティ](#認証とセキュリティ)
3. [ブックマーク管理API](#ブックマーク管理api)
4. [カテゴリ管理API](#カテゴリ管理api)
5. [検索・フィルタリングAPI](#検索フィルタリングapi)
6. [同期API](#同期api)
7. [エラーハンドリング](#エラーハンドリング)
8. [パフォーマンス最適化](#パフォーマンス最適化)
9. [実装のベストプラクティス](#実装のベストプラクティス)

## API概要

X BookmarkerのバックエンドAPIは、RESTful設計原則に基づいて構築されており、以下の特徴を持っています：

### 🏗️ **アーキテクチャ設計**

```typescript
// APIレイヤー構成
┌─────────────────┐
│   Frontend      │ ← React + TypeScript
├─────────────────┤
│   REST API      │ ← Express.js ルーター
├─────────────────┤
│  Service Layer  │ ← ビジネスロジック
├─────────────────┤
│  Database       │ ← PostgreSQL + Redis
└─────────────────┘
```

### 🔧 **技術スタック**

- **Webフレームワーク**: Express.js
- **バリデーション**: Zod（@x-bookmarker/shared）
- **データベース**: PostgreSQL (pg)
- **キューシステム**: Redis + Bull
- **認証**: JWT + セッション管理
- **セキュリティ**: helmet, cors, レート制限

### 📋 **APIの基本設計原則**

#### 1. **統一されたレスポンス形式**

```typescript
// 成功レスポンス
interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

// エラーレスポンス
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any[];
}
```

#### 2. **RESTfulな URL設計**

```
GET    /api/bookmarks          # 一覧取得
POST   /api/bookmarks          # 新規作成
GET    /api/bookmarks/:id      # 単体取得
PUT    /api/bookmarks/:id      # 更新
DELETE /api/bookmarks/:id      # 削除
POST   /api/bookmarks/bulk     # 一括操作
```

## 認証とセキュリティ

### 🔐 **JWT認証システム**

すべてのAPIエンドポイントは`authenticateJWT`ミドルウェアで保護されています：

```typescript
// middleware/auth.ts
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};
```

### 🛡️ **セキュリティレイヤー**

```typescript
// app.ts - セキュリティミドルウェアの適用順序
app.use(securityStack);           // CORS, Helmet等
app.use('/api', apiSecurityStack); // API固有のセキュリティ
app.use('/api', apiRateLimit);     // レート制限
app.use('/api/bookmarks', authenticateJWT); // 認証
```

### 📊 **レート制限**

```typescript
// 一般API: 100 requests/15分
// X API同期: 5 requests/15分（X APIレート制限に準拠）
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100,
  message: 'Too many requests, please try again later',
});
```

## ブックマーク管理API

### 📖 **GET /api/bookmarks - ブックマーク一覧取得**

高度なフィルタリングとページネーション機能を提供します。

#### **リクエスト例**

```bash
# 基本的な取得
GET /api/bookmarks?limit=20&offset=0

# カテゴリフィルタリング
GET /api/bookmarks?categoryIds=cat1,cat2&limit=10

# 全文検索
GET /api/bookmarks?text=AI&sortBy=relevance&sortOrder=desc

# 複合フィルタ
GET /api/bookmarks?text=技術&categoryIds=tech&hasMedia=true&dateFrom=2024-01-01
```

#### **クエリパラメータ**

| パラメータ | 型 | 説明 | デフォルト |
|-----------|----|----|----------|
| `text` | string | 全文検索キーワード | - |
| `categoryIds` | string[] | カテゴリIDの配列 | - |
| `tags` | string[] | タグの配列 | - |
| `authorUsername` | string | 作者ユーザー名 | - |
| `dateFrom` | string | 開始日付 (ISO 8601) | - |
| `dateTo` | string | 終了日付 (ISO 8601) | - |
| `hasMedia` | boolean | メディア有無 | - |
| `hasLinks` | boolean | リンク有無 | - |
| `sortBy` | enum | ソート基準 (`date`, `author`, `relevance`) | `date` |
| `sortOrder` | enum | ソート順 (`asc`, `desc`) | `desc` |
| `limit` | number | 取得件数 (最大100) | 20 |
| `offset` | number | オフセット | 0 |
| `includeArchived` | boolean | アーカイブ済みを含む | false |

#### **レスポンス例**

```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "id": "bookmark-uuid",
        "xTweetId": "1234567890",
        "content": "AIについての興味深い投稿...",
        "authorUsername": "tech_expert",
        "authorDisplayName": "Tech Expert",
        "authorAvatarUrl": "https://...",
        "mediaUrls": ["https://..."],
        "links": ["https://..."],
        "hashtags": ["AI", "技術"],
        "mentions": ["@openai"],
        "categoryId": "tech-category",
        "category": {
          "id": "tech-category",
          "name": "技術・AI",
          "color": "#3B82F6",
          "icon": "cpu"
        },
        "tags": ["機械学習", "Deep Learning"],
        "isArchived": false,
        "bookmarkedAt": "2024-01-15T10:30:00Z",
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 150,
      "hasMore": true
    },
    "query": {
      "text": "AI",
      "sortBy": "relevance",
      "executionTime": 1642247400000
    }
  }
}
```

#### **実装のポイント**

##### **1. 動的SQLクエリ生成**

```typescript
// routes/bookmarks.ts - 柔軟なフィルタリング実装
function buildBookmarkQuery(filters: SearchQuery): { query: string; params: any[] } {
  let sqlQuery = `
    SELECT 
      b.*,
      c.name as category_name,
      c.color as category_color,
      c.icon as category_icon
    FROM bookmarks b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = $1
  `;
  
  const params = [filters.userId];
  let paramIndex = 2;

  // 動的フィルタ追加
  if (filters.text) {
    sqlQuery += ` AND b.search_vector @@ plainto_tsquery('english_unaccent', $${paramIndex})`;
    params.push(filters.text);
    paramIndex++;
  }

  if (filters.categoryIds?.length > 0) {
    sqlQuery += ` AND b.category_id = ANY($${paramIndex})`;
    params.push(filters.categoryIds);
    paramIndex++;
  }

  // ... 他のフィルタ条件
}
```

##### **2. PostgreSQL全文検索**

```sql
-- 全文検索インデックス（マイグレーションで作成済み）
CREATE INDEX idx_bookmarks_search_vector 
ON bookmarks USING GIN(search_vector);

-- 検索クエリ例
SELECT * FROM bookmarks 
WHERE search_vector @@ plainto_tsquery('english_unaccent', 'AI技術')
ORDER BY ts_rank(search_vector, plainto_tsquery('english_unaccent', 'AI技術')) DESC;
```

##### **3. パフォーマンス最適化**

```typescript
// カウントクエリの最適化
const countQuery = sqlQuery
  .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) FROM')
  .replace(/ORDER BY.*$/, '');

// インデックス活用のためのクエリ設計
const indexOptimizedQuery = `
  SELECT b.* FROM bookmarks b
  WHERE b.user_id = $1 
    AND b.is_archived = FALSE  -- 部分インデックス活用
    AND b.bookmarked_at >= $2  -- 範囲検索でインデックス活用
  ORDER BY b.bookmarked_at DESC -- インデックス順でのソート
`;
```

### ✏️ **POST /api/bookmarks - ブックマーク作成**

手動でブックマークを作成する機能です。

#### **リクエスト例**

```bash
POST /api/bookmarks
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "xTweetId": "1234567890",
  "content": "興味深いAIの論文が公開されました",
  "authorUsername": "ai_researcher",
  "authorDisplayName": "AI Researcher",
  "authorAvatarUrl": "https://example.com/avatar.jpg",
  "mediaUrls": ["https://example.com/image.jpg"],
  "links": ["https://arxiv.org/abs/2024.0001"],
  "hashtags": ["AI", "研究"],
  "mentions": ["@openai"],
  "categoryId": "tech-category",
  "tags": ["機械学習", "論文"],
  "bookmarkedAt": "2024-01-15T10:30:00Z"
}
```

#### **バリデーション**

```typescript
// @x-bookmarker/shared/src/types.ts
export const CreateBookmarkSchema = z.object({
  xTweetId: z.string().min(1),
  content: z.string(),
  authorUsername: z.string(),
  authorDisplayName: z.string(),
  authorAvatarUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).default([]),
  links: z.array(z.string().url()).default([]),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  bookmarkedAt: z.date(),
});
```

#### **実装の特徴**

##### **1. 重複チェック**

```typescript
// routes/bookmarks.ts
const existingBookmark = await db.query(
  'SELECT id FROM bookmarks WHERE user_id = $1 AND x_tweet_id = $2',
  [req.user.userId, data.xTweetId]
);

if (existingBookmark.rows.length > 0) {
  return res.status(409).json({
    success: false,
    error: 'Bookmark with this tweet ID already exists',
    code: 'BOOKMARK_ALREADY_EXISTS'
  });
}
```

##### **2. カテゴリ存在確認**

```typescript
if (data.categoryId) {
  const categoryResult = await db.query(
    'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
    [data.categoryId, req.user.userId]
  );

  if (categoryResult.rows.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Category not found',
      code: 'CATEGORY_NOT_FOUND'
    });
  }
}
```

### 📝 **PUT /api/bookmarks/:id - ブックマーク更新**

既存ブックマークの部分更新をサポートします。

#### **リクエスト例**

```bash
PUT /api/bookmarks/bookmark-uuid
Content-Type: application/json

{
  "categoryId": "new-category-id",
  "tags": ["新しいタグ", "更新されたタグ"]
}
```

#### **実装のポイント**

##### **1. 部分更新の動的SQL生成**

```typescript
// routes/bookmarks.ts
const updateEntries = Object.entries(updates).filter(
  ([, value]) => value !== undefined
);

if (updateEntries.length === 0) {
  return res.status(400).json({
    success: false,
    error: 'No valid fields to update',
    code: 'NO_UPDATE_FIELDS'
  });
}

const setClause = updateEntries
  .map(([field], index) => `${field} = $${index + 3}`)
  .join(', ');
const values = updateEntries.map(([, value]) => value);

const result = await db.query(`
  UPDATE bookmarks 
  SET ${setClause}, updated_at = NOW()
  WHERE id = $1 AND user_id = $2
  RETURNING *
`, [bookmarkId, req.user.userId, ...values]);
```

### 🗑️ **DELETE /api/bookmarks/:id - ブックマーク削除**

所有権確認を行った上で安全にブックマークを削除します。

#### **実装例**

```typescript
const result = await db.query(
  'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
  [bookmarkId, req.user.userId]
);

if (result.rows.length === 0) {
  return res.status(404).json({
    success: false,
    error: 'Bookmark not found',
    code: 'BOOKMARK_NOT_FOUND'
  });
}
```

### 📦 **POST /api/bookmarks/bulk - 一括操作**

複数のブックマークを効率的に更新・削除します。

#### **リクエスト例**

```bash
POST /api/bookmarks/bulk
Content-Type: application/json

{
  "bookmarkIds": ["id1", "id2", "id3"],
  "updates": {
    "categoryId": "new-category",
    "tags": ["一括更新", "効率化"]
  }
}
```

#### **パフォーマンス最適化**

```typescript
// 所有権の一括確認
const ownershipCheck = await db.query(
  'SELECT id FROM bookmarks WHERE id = ANY($1) AND user_id = $2',
  [bookmarkIds, req.user.userId]
);

if (ownershipCheck.rows.length !== bookmarkIds.length) {
  return res.status(400).json({
    success: false,
    error: 'Some bookmarks do not exist or do not belong to user',
    code: 'INVALID_BOOKMARK_OWNERSHIP'
  });
}

// 一括更新（N+1問題を回避）
const result = await db.query(`
  UPDATE bookmarks 
  SET ${setClause}, updated_at = NOW()
  WHERE id = ANY($1) AND user_id = $2
  RETURNING id
`, [bookmarkIds, req.user.userId, ...values]);
```

## カテゴリ管理API

### 🗂️ **階層カテゴリシステム**

隣接リストモデルを使用した階層構造の実装です。

#### **GET /api/categories - カテゴリ一覧（階層構造）**

```typescript
// routes/categories.ts - 階層構造の構築
async function buildCategoryHierarchy(rows: any[]): Promise<HierarchicalCategory[]> {
  const categoriesMap = new Map<string, any>();
  const rootCategories: any[] = [];

  // 第1パス: 全カテゴリをMapに格納
  rows.forEach(row => {
    const category = formatCategory(row, true);
    categoriesMap.set(category.id, { ...category, children: [] });
  });

  // 第2パス: 階層関係を構築
  categoriesMap.forEach(category => {
    if (category.parentId) {
      const parent = categoriesMap.get(category.parentId);
      if (parent) {
        parent.children.push(category);
      } else {
        rootCategories.push(category); // 孤児カテゴリはルートレベルに
      }
    } else {
      rootCategories.push(category);
    }
  });

  return rootCategories;
}
```

#### **循環参照防止システム**

```typescript
// routes/categories.ts
async function wouldCreateCircularReference(
  categoryId: string,
  newParentId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(`
    WITH RECURSIVE descendants AS (
      -- 指定カテゴリの直接の子を取得
      SELECT id, parent_id 
      FROM categories 
      WHERE parent_id = $1 AND user_id = $2
      
      UNION ALL
      
      -- 子の子を再帰的に取得
      SELECT c.id, c.parent_id
      FROM categories c
      INNER JOIN descendants d ON c.parent_id = d.id
      WHERE c.user_id = $2
    )
    SELECT COUNT(*) as count 
    FROM descendants 
    WHERE id = $3
  `, [categoryId, userId, newParentId]);
  
  return parseInt(result.rows[0].count) > 0;
}
```

## 検索・フィルタリングAPI

### 🔍 **GET /api/search - 高度な検索**

SearchServiceクラスを使用した包括的な検索機能です。

#### **ファセット検索の実装**

```typescript
// services/searchService.ts
async search(
  userId: string, 
  query: SearchQuery, 
  includeFacets: boolean = true
): Promise<SearchResult> {
  const startTime = Date.now();
  
  // メイン検索クエリ実行
  const bookmarks = await this.executeSearchQuery(userId, query);
  
  // ファセット情報取得（並列実行で高速化）
  const facets = includeFacets ? await Promise.all([
    this.getCategoryFacets(userId, query),
    this.getTagFacets(userId, query),
    this.getAuthorFacets(userId, query),
    this.getDateFacets(userId, query)
  ]) : undefined;

  return {
    bookmarks,
    totalCount: bookmarks.length,
    facets: facets ? {
      categories: facets[0],
      tags: facets[1],
      authors: facets[2],
      dates: facets[3]
    } : undefined,
    executionTime: Date.now() - startTime
  };
}
```

#### **検索履歴の自動保存**

```typescript
// routes/search.ts
if (query.text || query.categoryIds?.length || query.tags?.length) {
  try {
    await searchService.saveToHistory(
      req.user.userId,
      query,
      searchResult.totalCount,
      searchResult.executionTime
    );
  } catch (error) {
    // 検索履歴保存の失敗は検索自体を失敗させない
    console.warn('Failed to save search history:', error);
  }
}
```

## 同期API

### 🔄 **POST /api/sync/start - 同期開始**

X APIとの同期を開始し、非同期ジョブとして実行します。

#### **同期ジョブの設定**

```typescript
// routes/sync.ts
const configValidation = SyncJobConfigSchema.safeParse({
  userId: req.user.userId,
  fullSync: req.body.fullSync || false,
  maxTweets: req.body.maxTweets || 1000,
  batchSize: req.body.batchSize || 100,
  stopOnError: req.body.stopOnError || false,
  ...req.body
});
```

#### **アクセストークン検証**

```typescript
// トークン有効性チェック
if (user.token_expires_at && new Date(user.token_expires_at) <= new Date()) {
  return res.status(400).json({
    success: false,
    error: 'Access token expired',
    code: 'ACCESS_TOKEN_EXPIRED'
  });
}
```

### 📊 **GET /api/sync/status/:jobId - 進捗監視**

リアルタイムでの同期進捗監視機能です。

```typescript
// jobs/syncJob.ts - 進捗更新
async function updateJobProgress(jobId: string, progress: SyncProgress) {
  await this.queue.add('updateProgress', {
    jobId,
    progress: {
      phase: progress.phase,
      current: progress.current,
      total: progress.total,
      message: progress.message,
      errors: progress.errors
    }
  });
}
```

## エラーハンドリング

### 🚨 **階層的エラー処理**

```typescript
// 1. カスタムエラークラス
class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

// 2. エラー分類と適切な処理
try {
  await bookmarkService.createBookmark(data);
} catch (error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: error.message,
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }
  
  if (error instanceof ConflictError) {
    return res.status(409).json({
      success: false,
      error: error.message,
      code: 'RESOURCE_CONFLICT'
    });
  }
  
  // 未知のエラーは500として処理
  console.error('Unexpected error:', error);
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}
```

### 📝 **構造化ログ出力**

```typescript
// ログ関数の統一
function logAPIOperation(operation: string, data: any, result?: any, error?: Error) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    userId: data.userId,
    success: !error,
    duration: Date.now() - data.startTime,
    error: error ? {
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    } : undefined
  };

  if (error) {
    console.error('❌ API operation failed:', logEntry);
  } else {
    console.log('✅ API operation completed:', logEntry);
  }
}
```

## パフォーマンス最適化

### ⚡ **データベース最適化**

#### **1. インデックス戦略**

```sql
-- 複合インデックス（よく使われる組み合わせ）
CREATE INDEX idx_bookmarks_user_category 
ON bookmarks(user_id, category_id);

CREATE INDEX idx_bookmarks_user_archived 
ON bookmarks(user_id, is_archived);

-- 部分インデックス（条件付きインデックス）
CREATE INDEX idx_bookmarks_active 
ON bookmarks(user_id, bookmarked_at DESC) 
WHERE is_archived = FALSE;

-- GINインデックス（配列と全文検索）
CREATE INDEX idx_bookmarks_tags 
ON bookmarks USING GIN(tags);

CREATE INDEX idx_bookmarks_search_vector 
ON bookmarks USING GIN(search_vector);
```

#### **2. クエリ最適化**

```typescript
// EXPLAINを使用したクエリ分析
async function analyzeQuery(query: string, params: any[]) {
  if (process.env.NODE_ENV === 'development') {
    const explanation = await db.query(`EXPLAIN ANALYZE ${query}`, params);
    console.log('Query Plan:', explanation.rows);
  }
}

// インデックスヒントの活用
const optimizedQuery = `
  SELECT b.* FROM bookmarks b
  WHERE b.user_id = $1 
    AND b.is_archived = FALSE  -- 部分インデックス活用
  ORDER BY b.bookmarked_at DESC -- インデックス順序での高速ソート
  LIMIT $2 OFFSET $3
`;
```

### 🚀 **API レスポンス最適化**

#### **1. ページネーション最適化**

```typescript
// カーソルベースページネーション（大量データ用）
interface CursorPagination {
  after?: string;  // 最後のアイテムのカーソル
  limit: number;
}

async function getPaginatedBookmarks(userId: string, pagination: CursorPagination) {
  const whereClause = pagination.after 
    ? 'AND b.bookmarked_at < (SELECT bookmarked_at FROM bookmarks WHERE id = $3)'
    : '';
    
  const query = `
    SELECT b.* FROM bookmarks b
    WHERE b.user_id = $1 AND b.is_archived = FALSE ${whereClause}
    ORDER BY b.bookmarked_at DESC
    LIMIT $2
  `;
  
  const params = pagination.after 
    ? [userId, pagination.limit, pagination.after]
    : [userId, pagination.limit];
    
  return db.query(query, params);
}
```

#### **2. N+1クエリ問題の解決**

```typescript
// JOINを使用した効率的なデータ取得
const efficientQuery = `
  SELECT 
    b.*,
    c.name as category_name,
    c.color as category_color,
    c.icon as category_icon
  FROM bookmarks b
  LEFT JOIN categories c ON b.category_id = c.id
  WHERE b.user_id = $1
  ORDER BY b.bookmarked_at DESC
`;

// 個別クエリではなく一括取得
const bookmarksWithCategories = await db.query(efficientQuery, [userId]);
```

## 実装のベストプラクティス

### 🎯 **設計原則**

#### **1. 単一責任原則の適用**

```typescript
// ❌ 悪い例: 1つのクラスが複数の責任を持つ
class BookmarkHandler {
  async getBookmarks() { /* ... */ }
  async validateBookmark() { /* ... */ }
  async sendEmail() { /* ... */ }  // メール送信は別の責任
  async logActivity() { /* ... */ } // ログ出力も別の責任
}

// ✅ 良い例: 責任を分離
class BookmarkService {
  async getBookmarks() { /* ... */ }
  async validateBookmark() { /* ... */ }
}

class EmailService {
  async sendNotification() { /* ... */ }
}

class ActivityLogger {
  async logBookmarkActivity() { /* ... */ }
}
```

#### **2. 依存性注入の活用**

```typescript
// routes/bookmarks.ts
class BookmarkController {
  constructor(
    private db: Pool,
    private bookmarkService: BookmarkService,
    private emailService: EmailService
  ) {}
  
  async createBookmark(req: Request, res: Response) {
    // 各サービスを注入された依存関係として使用
    const bookmark = await this.bookmarkService.create(req.body);
    await this.emailService.sendCreationNotification(bookmark);
    res.json(bookmark);
  }
}
```

### 🔒 **セキュリティベストプラクティス**

#### **1. 入力検証の徹底**

```typescript
// Zodを使用した厳密な型チェック
const CreateBookmarkSchema = z.object({
  xTweetId: z.string()
    .min(1, 'Tweet ID is required')
    .regex(/^\d+$/, 'Tweet ID must be numeric'),
  content: z.string()
    .max(10000, 'Content too long')
    .transform(str => str.trim()),
  authorUsername: z.string()
    .min(1, 'Author username is required')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Invalid username format'),
});
```

#### **2. SQLインジェクション防止**

```typescript
// ❌ 危険: 文字列結合によるSQL
const unsafeQuery = `SELECT * FROM bookmarks WHERE user_id = '${userId}'`;

// ✅ 安全: パラメータ化クエリ
const safeQuery = 'SELECT * FROM bookmarks WHERE user_id = $1';
await db.query(safeQuery, [userId]);
```

#### **3. 認可の実装**

```typescript
// リソースレベルでの認可チェック
async function checkBookmarkOwnership(bookmarkId: string, userId: string) {
  const result = await db.query(
    'SELECT user_id FROM bookmarks WHERE id = $1',
    [bookmarkId]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('Bookmark not found');
  }
  
  if (result.rows[0].user_id !== userId) {
    throw new ForbiddenError('Access denied');
  }
}
```

### 📊 **監視とメトリクス**

#### **1. パフォーマンス監視**

```typescript
// 実行時間の計測
async function withTiming<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${operationName} completed in ${duration}ms`);
    
    // 異常に遅い処理を警告
    if (duration > 5000) {
      console.warn(`⚠️ Slow operation detected: ${operationName} took ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ ${operationName} failed after ${duration}ms:`, error);
    throw error;
  }
}
```

#### **2. ヘルスチェックの実装**

```typescript
// app.ts
app.get('/health', async (req, res) => {
  try {
    // データベース接続確認
    await db.query('SELECT 1');
    
    // Redis接続確認
    await redis.ping();
    
    // 同期キューの状態確認
    const queueStats = await syncJobManager.getQueueStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
        syncQueue: queueStats.active < 10 ? 'up' : 'degraded'
      }
    };
    
    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});
```

### 🧪 **テスト戦略**

#### **1. 単体テスト**

```typescript
// bookmarkService.test.ts
describe('BookmarkService', () => {
  let service: BookmarkService;
  let mockDb: Pool;
  
  beforeEach(() => {
    mockDb = createMockPool();
    service = new BookmarkService(mockDb);
  });
  
  test('should create bookmark successfully', async () => {
    // Arrange
    const bookmarkData = {
      xTweetId: '12345',
      content: 'Test content',
      authorUsername: 'testuser'
    };
    
    mockDb.query.mockResolvedValue({
      rows: [{ id: 'bookmark-id', ...bookmarkData }]
    });
    
    // Act
    const result = await service.createBookmark('user-id', bookmarkData);
    
    // Assert
    expect(result).toEqual({
      id: 'bookmark-id',
      ...bookmarkData
    });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bookmarks'),
      expect.arrayContaining(['user-id', '12345'])
    );
  });
});
```

#### **2. 統合テスト**

```typescript
// bookmarkRoutes.integration.test.ts
describe('Bookmark API Integration', () => {
  let app: Express;
  let testDb: Pool;
  let authToken: string;
  
  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = createTestApp(testDb);
    authToken = await createTestUser();
  });
  
  test('GET /api/bookmarks returns user bookmarks', async () => {
    // Setup test data
    await createTestBookmarks();
    
    const response = await request(app)
      .get('/api/bookmarks')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ limit: 10 });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.bookmarks).toHaveLength(10);
    expect(response.body.data.pagination.total).toBeGreaterThan(0);
  });
});
```

## まとめ

X BookmarkerのブックマークAPIは、以下の点で優れた実装となっています：

### ✨ **主要な特徴**

1. **包括的な機能**: CRUD操作から高度な検索まで
2. **高いパフォーマンス**: インデックス最適化とクエリ効率化
3. **堅牢なセキュリティ**: 認証・認可・入力検証の徹底
4. **拡張性**: サービス層アーキテクチャとDI
5. **運用性**: 監視・ログ・ヘルスチェック

### 🎯 **開発者への推奨事項**

1. **API使用時**: 適切なページネーションとフィルタリングの活用
2. **エラーハンドリング**: レスポンスコードと構造化エラーメッセージの確認
3. **パフォーマンス**: 不要なデータ取得を避け、必要な項目のみを要求
4. **セキュリティ**: JWTトークンの適切な管理と認証ヘッダーの設定

この実装ガイドを参考に、X BookmarkerのAPIを効果的に活用し、優れたブックマーク管理体験を提供してください。

---

> 💡 **関連ドキュメント**: 
> - [アーキテクチャガイド](./bookmark-architecture.md)
> - [検索API仕様](./search-api-reference.md)
> - [認証ガイド](./auth-guide.md)