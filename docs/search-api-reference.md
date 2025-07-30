# 検索API リファレンス

このドキュメントでは、X Bookmarkerの検索APIの使用方法について、実際のリクエスト・レスポンス例とともに詳しく解説します。

## 基本情報

- **ベースURL**: `/api/search`
- **認証**: すべてのエンドポイントでJWT認証が必要
- **レート制限**: IPアドレスごとに100リクエスト/分
- **Content-Type**: `application/json`

## 認証ヘッダー

すべてのリクエストには認証ヘッダーが必要です：

```javascript
headers: {
  'Authorization': 'Bearer your-jwt-token-here',
  'Content-Type': 'application/json'
}
```

## エンドポイント一覧

### 1. 高度検索 - `GET /api/search`

ブックマークの高度検索を実行します。

#### リクエストパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|-----|------|------------|------|
| `text` | string | ❌ | - | 検索テキスト（全文検索） |
| `categoryIds` | string[] | ❌ | - | カテゴリIDの配列 |
| `tags` | string[] | ❌ | - | タグの配列 |
| `authorUsername` | string | ❌ | - | 作者ユーザー名（部分一致） |
| `dateFrom` | string (ISO) | ❌ | - | 開始日（ISO形式） |
| `dateTo` | string (ISO) | ❌ | - | 終了日（ISO形式） |
| `hasMedia` | boolean | ❌ | - | メディア有無フィルタ |
| `hasLinks` | boolean | ❌ | - | リンク有無フィルタ |
| `sortBy` | enum | ❌ | relevance | ソート基準（relevance/date/author） |
| `sortOrder` | enum | ❌ | desc | ソート順（asc/desc） |
| `limit` | number | ❌ | 20 | 取得件数（最大100） |
| `offset` | number | ❌ | 0 | オフセット |
| `includeFacets` | boolean | ❌ | true | ファセット情報を含めるか |

#### リクエスト例

```javascript
// 基本的なテキスト検索
const response = await fetch('/api/search?text=JavaScript&limit=10', {
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  }
});

// 複合条件での検索
const searchParams = new URLSearchParams({
  text: 'React',
  categoryIds: ['cat-1', 'cat-2'],
  tags: ['frontend', 'javascript'],
  hasMedia: 'true',
  sortBy: 'date',
  sortOrder: 'desc',
  limit: '25',
  offset: '0'
});

const response = await fetch(`/api/search?${searchParams}`, {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "id": "bm-123",
        "xTweetId": "1234567890",
        "content": "Reactの新機能について説明したツイート",
        "authorUsername": "react_dev",
        "authorDisplayName": "React Developer",
        "authorAvatarUrl": "https://example.com/avatar.jpg",
        "mediaUrls": ["https://example.com/image.jpg"],
        "links": ["https://reactjs.org"],
        "hashtags": ["React", "JavaScript"],
        "mentions": ["@reactjs"],
        "categoryId": "cat-1",
        "category": {
          "id": "cat-1",
          "name": "フロントエンド",
          "color": "#3B82F6",
          "icon": "code"
        },
        "tags": ["frontend", "javascript", "react"],
        "isArchived": false,
        "bookmarkedAt": "2024-01-15T10:30:00Z",
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T10:30:00Z",
        "relevanceScore": 0.85
      }
    ],
    "pagination": {
      "limit": 25,
      "offset": 0,
      "total": 156,
      "hasMore": true
    },
    "facets": {
      "categories": [
        {
          "id": "cat-1",
          "name": "フロントエンド",
          "color": "#3B82F6",
          "icon": "code",
          "count": 45
        },
        {
          "id": "cat-2", 
          "name": "バックエンド",
          "color": "#10B981",
          "icon": "server",
          "count": 23
        }
      ],
      "tags": [
        {"name": "javascript", "count": 67},
        {"name": "react", "count": 34},
        {"name": "typescript", "count": 28}
      ],
      "authors": [
        {
          "username": "react_dev",
          "displayName": "React Developer",
          "avatarUrl": "https://example.com/avatar.jpg",
          "count": 12
        }
      ]
    },
    "query": {
      "text": "React",
      "categoryIds": ["cat-1", "cat-2"],
      "tags": ["frontend", "javascript"],
      "executionTime": 45
    }
  }
}
```

### 2. 検索履歴取得 - `GET /api/search/history`

ユーザーの検索履歴を取得します。

#### リクエストパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|-----|------|------------|------|
| `limit` | number | ❌ | 20 | 取得件数（最大100） |
| `offset` | number | ❌ | 0 | オフセット |

#### リクエスト例

```javascript
const response = await fetch('/api/search/history?limit=10&offset=0', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "hist-123",
        "query": {
          "text": "React hooks",
          "categoryIds": ["cat-1"],
          "limit": 20,
          "offset": 0
        },
        "resultCount": 15,
        "executionTime": 42,
        "createdAt": "2024-01-15T14:30:00Z"
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 25,
      "hasMore": true
    }
  }
}
```

### 3. 検索履歴保存 - `POST /api/search/history`

検索クエリを履歴に保存します。

#### リクエストボディ

```typescript
{
  query: SearchQuery;        // 検索クエリオブジェクト
  resultCount?: number;      // 検索結果件数
  executionTime?: number;    // 実行時間（ミリ秒）
}
```

#### リクエスト例

```javascript
const response = await fetch('/api/search/history', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: {
      text: 'Vue.js tutorial',
      categoryIds: ['cat-2'],
      tags: ['frontend'],
      limit: 20,
      offset: 0
    },
    resultCount: 8,
    executionTime: 35
  })
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "id": "hist-456"
  },
  "message": "Search query saved to history"
}
```

### 4. 検索履歴削除 - `DELETE /api/search/history/:id`

特定の検索履歴エントリを削除します。

#### リクエスト例

```javascript
const response = await fetch('/api/search/history/hist-123', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "message": "Search history entry deleted"
}
```

### 5. 検索履歴全削除 - `DELETE /api/search/history`

ユーザーの全検索履歴を削除します。

#### リクエスト例

```javascript
const response = await fetch('/api/search/history', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "deletedCount": 15
  },
  "message": "Search history cleared"
}
```

### 6. 検索候補取得 - `GET /api/search/suggestions`

オートコンプリート用の検索候補を取得します。

#### リクエストパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|-----|------|------------|------|
| `q` | string | ✅ | - | 検索文字列（2文字以上） |
| `limit` | number | ❌ | 10 | 取得件数（最大20） |

#### リクエスト例

```javascript
const response = await fetch('/api/search/suggestions?q=react&limit=5', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "suggestions": {
      "tags": ["react", "react-hooks", "react-native"],
      "authors": ["React Developer", "React Team"],
      "categories": ["フロントエンド", "JavaScript"]
    },
    "query": "react"
  }
}
```

### 7. 検索分析 - `GET /api/search/analytics`

検索利用統計とトレンド分析を取得します。

#### リクエストパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|-----|------|------------|------|
| `days` | number | ❌ | 30 | 分析期間（日数、最大90） |

#### リクエスト例

```javascript
const response = await fetch('/api/search/analytics?days=7', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

#### レスポンス例

```json
{
  "success": true,
  "data": {
    "totalSearches": 156,
    "avgExecutionTime": 38.5,
    "mostSearchedTerms": [
      {"query": "React", "count": 23},
      {"query": "JavaScript", "count": 18},
      {"query": "TypeScript", "count": 12}
    ],
    "searchTrends": [
      {"date": "2024-01-08", "count": 12},
      {"date": "2024-01-09", "count": 18},
      {"date": "2024-01-10", "count": 25}
    ],
    "period": {
      "days": 7,
      "from": "2024-01-08T00:00:00Z",
      "to": "2024-01-15T00:00:00Z"
    }
  }
}
```

## エラーレスポンス

すべてのエンドポイントで統一されたエラーフォーマットを使用します：

### 認証エラー (401)

```json
{
  "success": false,
  "error": "Authentication required",
  "code": "AUTHENTICATION_REQUIRED"
}
```

### バリデーションエラー (400)

```json
{
  "success": false,
  "error": "Invalid search parameters",
  "code": "INVALID_SEARCH_PARAMS",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["limit"],
      "message": "Expected number, received string"
    }
  ]
}
```

### レート制限エラー (429)

```json
{
  "success": false,
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

### サーバーエラー (500)

```json
{
  "success": false,
  "error": "Search failed",
  "code": "SEARCH_ERROR"
}
```

## 使用例：検索機能の実装

### React/TypeScriptでの実装例

```typescript
import React, { useState, useEffect } from 'react';

interface SearchProps {
  onResults: (results: SearchResult) => void;
}

const SearchComponent: React.FC<SearchProps> = ({ onResults }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 検索候補の取得（デバウンス付き）
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        try {
          const response = await fetch(
            `/api/search/suggestions?q=${encodeURIComponent(query)}`,
            {
              headers: {
                'Authorization': `Bearer ${getToken()}`,
              }
            }
          );
          const data = await response.json();
          setSuggestions(data.data.suggestions.tags);
        } catch (error) {
          console.error('Failed to fetch suggestions:', error);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // 検索実行
  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const searchParams = new URLSearchParams({
        text: query,
        limit: '20',
        offset: '0'
      });

      const response = await fetch(`/api/search?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        }
      });

      const data = await response.json();
      
      if (data.success) {
        onResults(data.data);
      } else {
        console.error('Search failed:', data.error);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-component">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ブックマークを検索..."
        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
      />
      
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((suggestion, index) => (
            <li 
              key={index}
              onClick={() => setQuery(suggestion)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
      
      <button 
        onClick={handleSearch}
        disabled={loading}
      >
        {loading ? '検索中...' : '検索'}
      </button>
    </div>
  );
};

// 認証トークンの取得（実装依存）
const getToken = () => localStorage.getItem('authToken');
```

### Node.js/Express での実装例

```javascript
const express = require('express');
const axios = require('axios');

const app = express();

// プロキシ検索エンドポイント
app.get('/proxy/search', async (req, res) => {
  try {
    const token = req.headers.authorization;
    
    const response = await axios.get('http://api-server/api/search', {
      params: req.query,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({
        success: false,
        error: 'Proxy error',
        code: 'PROXY_ERROR'
      });
    }
  }
});
```

## パフォーマンスのベストプラクティス

### 1. 適切なページネーション

```javascript
// 大量の結果を一度に取得するのを避ける
const searchParams = new URLSearchParams({
  text: query,
  limit: '20',  // 適切なページサイズ
  offset: String(page * 20)
});
```

### 2. ファセットの選択的使用

```javascript
// ファセットが不要な場合は無効化してパフォーマンス向上
const searchParams = new URLSearchParams({
  text: query,
  includeFacets: 'false'  // ファセットを無効化
});
```

### 3. デバウンスによる候補取得

```javascript
// 連続入力時のAPIコール数を制限
const debouncedGetSuggestions = debounce(getSuggestions, 300);
```

## まとめ

X Bookmarkerの検索APIは、以下の特徴を持っています：

- **高度な検索機能**: 全文検索、ファセット検索、フィルタリング
- **統一されたレスポンス形式**: 成功・エラー共に一貫したJSON構造
- **適切なHTTPステータスコード**: RESTfulな設計
- **詳細なエラー情報**: デバッグに役立つエラーメッセージ
- **パフォーマンス最適化**: 効率的なページネーションとキャッシュ対応

このAPIリファレンスを参考に、クライアントアプリケーションでの検索機能実装を進めてください。

---

> 💡 **関連ドキュメント**: 
> - [検索アーキテクチャガイド](./search-architecture.md)
> - [SearchServiceガイド](./searchservice-guide.md)