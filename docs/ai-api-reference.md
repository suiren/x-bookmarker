# AI分析API - リファレンス

## 概要

X BookmarkerのAI分析APIは、ブックマークされたツイートコンテンツの自動分析機能を提供します。コンテンツの分析、カテゴリ提案、タグ生成、感情分析、言語検出などを行い、ユーザーのブックマーク整理を支援します。

## 認証

すべてのAI分析APIエンドポイントは認証が必要です。リクエストヘッダーに有効なJWTトークンを含める必要があります。

```http
Authorization: Bearer <jwt_token>
```

## エンドポイント一覧

### 1. コンテンツ分析

#### POST /api/ai/analyze

ツイートコンテンツを分析し、カテゴリ提案、タグ生成、感情分析を行います。

**リクエスト**

```http
POST /api/ai/analyze
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "content": "Reactの新しいhooksについて学んでいます。とても興味深い機能ですね！",
  "bookmarkId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**リクエストボディ**

| フィールド | 型 | 必須 | 説明 |
|-----------|----|----|------|
| content | string | ✅ | 分析対象のテキストコンテンツ（1-5000文字） |
| bookmarkId | string | ❌ | 関連するブックマークのUUID |

**レスポンス（成功）**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "suggestedCategories": [
      {
        "categoryName": "技術・AI",
        "confidence": 0.92
      },
      {
        "categoryName": "プログラミング",
        "confidence": 0.85
      }
    ],
    "suggestedTags": [
      "react",
      "hooks",
      "javascript",
      "frontend",
      "webdevelopment"
    ],
    "sentiment": "positive",
    "language": "japanese",
    "topics": [
      "web development",
      "react framework",
      "programming"
    ]
  },
  "message": "Content analyzed successfully"
}
```

**レスポンス（エラー）**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "content",
      "message": "Content is required",
      "code": "invalid_type"
    }
  ]
}
```

**レスポンスフィールド説明**

| フィールド | 型 | 説明 |
|-----------|----|----|
| suggestedCategories | Array | 提案カテゴリリスト |
| suggestedCategories[].categoryName | string | カテゴリ名 |
| suggestedCategories[].confidence | number | 信頼度スコア（0.0-1.0） |
| suggestedTags | string[] | 提案タグリスト |
| sentiment | string | 感情分析結果（positive/negative/neutral） |
| language | string | 検出言語 |
| topics | string[] | 主要トピック |

### 2. バッチ分析

#### POST /api/ai/batch-analyze

複数のブックマークを一度に分析し、Server-Sent Eventsでリアルタイム進捗を提供します。

**リクエスト**

```http
POST /api/ai/batch-analyze
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "bookmarkIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002"
  ]
}
```

**リクエストボディ**

| フィールド | 型 | 必須 | 説明 |
|-----------|----|----|------|
| bookmarkIds | string[] | ✅ | 分析対象ブックマークのUUIDリスト（1-100件） |

**レスポンス（Server-Sent Events）**

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

**進捗イベント**

```
data: {"type":"progress","processed":1,"total":3,"progress":33}

data: {"type":"progress","processed":2,"total":3,"progress":67}

data: {"type":"progress","processed":3,"total":3,"progress":100}
```

**完了イベント**

```
data: {"type":"complete","results":{"550e8400-e29b-41d4-a716-446655440000":{"suggestedCategories":[{"categoryName":"技術・AI","confidence":0.9}],"suggestedTags":["ai","technology"],"sentiment":"positive","language":"japanese","topics":["artificial intelligence"]},"550e8400-e29b-41d4-a716-446655440001":{"suggestedCategories":[{"categoryName":"プログラミング","confidence":0.85}],"suggestedTags":["programming","code"],"sentiment":"neutral","language":"english","topics":["software development"]}},"message":"Batch analysis completed successfully"}
```

**エラーイベント**

```
data: {"type":"error","error":"Failed to analyze bookmarks"}
```

**SSEイベント種別**

| イベント | 説明 |
|---------|------|
| progress | 分析進捗の更新 |
| complete | 分析完了と結果 |
| error | エラー発生 |

### 3. AI設定管理

#### GET /api/ai/config

現在のAI設定を取得します。

**リクエスト**

```http
GET /api/ai/config
Authorization: Bearer <jwt_token>
```

**レスポンス**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "provider": "openai",
    "model": "gpt-4",
    "enabled": true
  },
  "message": "AI configuration retrieved successfully"
}
```

**レスポンスフィールド**

| フィールド | 型 | 説明 |
|-----------|----|----|
| provider | string | AIプロバイダー（openai/anthropic/huggingface） |
| model | string | 使用中のAIモデル |
| enabled | boolean | AI機能の有効状態 |

#### PUT /api/ai/config

AI設定を更新します。

**リクエスト**

```http
PUT /api/ai/config
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "provider": "anthropic",
  "model": "claude-3-sonnet-20240229",
  "enabled": true
}
```

**リクエストボディ**

| フィールド | 型 | 必須 | 説明 |
|-----------|----|----|------|
| provider | string | ❌ | AIプロバイダー（openai/anthropic/huggingface） |
| model | string | ❌ | AIモデル名 |
| enabled | boolean | ❌ | AI機能の有効/無効 |

**レスポンス**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "enabled": true
  },
  "message": "AI configuration updated successfully"
}
```

### 4. ヘルスチェック

#### GET /api/ai/health

AIサービスの健康状態を確認します。

**リクエスト**

```http
GET /api/ai/health
Authorization: Bearer <jwt_token>
```

**レスポンス**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-4",
    "status": "healthy"
  },
  "message": "AI service health check completed"
}
```

**ステータス種別**

| ステータス | 説明 |
|-----------|------|
| healthy | AIサービス正常動作中 |
| disabled | AIサービス無効 |
| error | AIサービス異常 |

## エラーコード

### 400 Bad Request

リクエストの形式または内容に問題がある場合

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "content",
      "message": "Content too long",
      "code": "too_big"
    }
  ]
}
```

### 401 Unauthorized

認証が必要または認証に失敗した場合

```json
{
  "success": false,
  "error": "User not authenticated"
}
```

### 503 Service Unavailable

AIサービスが利用できない場合

```json
{
  "success": false,
  "error": "AI service is not enabled or configured"
}
```

### 500 Internal Server Error

サーバー内部エラー

```json
{
  "success": false,
  "error": "Failed to analyze content"
}
```

## レート制限

AI分析APIには以下のレート制限が適用されます：

- **個別分析**: 60リクエスト/分
- **バッチ分析**: 10リクエスト/時間
- **設定操作**: 30リクエスト/分

レート制限に達した場合は `429 Too Many Requests` が返されます。

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

## 使用例

### JavaScript/TypeScript

#### 基本的なコンテンツ分析

```typescript
const analyzeContent = async (content: string, token: string) => {
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
};

// 使用例
const analysisResult = await analyzeContent(
  'Reactの最新機能について調べています',
  'your-jwt-token'
);

console.log('提案カテゴリ:', analysisResult.suggestedCategories);
console.log('提案タグ:', analysisResult.suggestedTags);
```

#### バッチ分析（Server-Sent Events）

```typescript
const startBatchAnalysis = (bookmarkIds: string[], token: string) => {
  return new Promise((resolve, reject) => {
    // バッチ分析を開始
    fetch('/api/ai/batch-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ bookmarkIds })
    });

    // Server-Sent Eventsで進捗を監視
    const eventSource = new EventSource('/api/ai/batch-analyze', {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'progress':
            console.log(`進捗: ${data.progress}% (${data.processed}/${data.total})`);
            break;
            
          case 'complete':
            console.log('分析完了:', data.results);
            eventSource.close();
            resolve(data.results);
            break;
            
          case 'error':
            console.error('分析エラー:', data.error);
            eventSource.close();
            reject(new Error(data.error));
            break;
        }
      } catch (error) {
        console.error('SSEデータ解析エラー:', error);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE接続エラー');
      eventSource.close();
      reject(new Error('Connection lost'));
    };
  });
};

// 使用例
try {
  const results = await startBatchAnalysis([
    'bookmark-id-1',
    'bookmark-id-2',
    'bookmark-id-3'
  ], 'your-jwt-token');
  
  console.log('バッチ分析結果:', results);
} catch (error) {
  console.error('バッチ分析失败:', error);
}
```

#### AI設定の管理

```typescript
const getAiConfig = async (token: string) => {
  const response = await fetch('/api/ai/config', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return result.data;
};

const updateAiConfig = async (config: Partial<AiConfig>, token: string) => {
  const response = await fetch('/api/ai/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(config)
  });
  
  const result = await response.json();
  return result.data;
};

// 使用例
const currentConfig = await getAiConfig('your-jwt-token');
console.log('現在の設定:', currentConfig);

const updatedConfig = await updateAiConfig(
  { provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
  'your-jwt-token'
);
console.log('更新された設定:', updatedConfig);
```

### React Hooks実装例

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';

// コンテンツ分析フック
const useAnalyzeContent = () => {
  return useMutation({
    mutationFn: async ({ content, bookmarkId }: AnalyzeRequest) => {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ content, bookmarkId })
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      return response.json();
    }
  });
};

// AI設定取得フック
const useAiConfig = () => {
  return useQuery({
    queryKey: ['ai', 'config'],
    queryFn: async () => {
      const response = await fetch('/api/ai/config', {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000 // 5分間キャッシュ
  });
};

// コンポーネント使用例
const AnalysisComponent = () => {
  const analyzeMutation = useAnalyzeContent();
  const { data: config } = useAiConfig();

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      content: 'AIについて学んでいます'
    });
  };

  return (
    <div>
      <button 
        onClick={handleAnalyze}
        disabled={analyzeMutation.isPending}
      >
        {analyzeMutation.isPending ? '分析中...' : 'コンテンツを分析'}
      </button>
      
      {analyzeMutation.data && (
        <div>
          <h3>分析結果</h3>
          <p>カテゴリ: {analyzeMutation.data.data.suggestedCategories[0]?.categoryName}</p>
          <p>タグ: {analyzeMutation.data.data.suggestedTags.join(', ')}</p>
          <p>感情: {analyzeMutation.data.data.sentiment}</p>
        </div>
      )}
    </div>
  );
};
```

## ベストプラクティス

### 1. エラーハンドリング

```typescript
const analyzeWithErrorHandling = async (content: string) => {
  try {
    const result = await analyzeContent(content, token);
    return result;
  } catch (error) {
    if (error.status === 503) {
      // AI サービス無効時の処理
      console.warn('AI分析が利用できません。手動で分類してください。');
      return null;
    } else if (error.status === 429) {
      // レート制限時の処理
      console.warn('分析リクエストが多すぎます。しばらく待ってから再試行してください。');
      return null;
    } else {
      // その他のエラー
      console.error('分析中にエラーが発生しました:', error);
      throw error;
    }
  }
};
```

### 2. レート制限の考慮

```typescript
class AnalysisRateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequest = 0;
  private minInterval = 1000; // 1秒間隔

  async analyze(content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequest;
          
          if (timeSinceLastRequest < this.minInterval) {
            await new Promise(resolve => 
              setTimeout(resolve, this.minInterval - timeSinceLastRequest)
            );
          }
          
          const result = await analyzeContent(content, getToken());
          this.lastRequest = Date.now();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    
    this.processing = false;
  }
}
```

### 3. バッチ処理の最適化

```typescript
const optimizedBatchAnalysis = async (bookmarkIds: string[]) => {
  const BATCH_SIZE = 10; // 一度に10件まで
  const batches = [];
  
  // バッチに分割
  for (let i = 0; i < bookmarkIds.length; i += BATCH_SIZE) {
    batches.push(bookmarkIds.slice(i, i + BATCH_SIZE));
  }
  
  const allResults = new Map();
  
  // 順次処理（レート制限を考慮）
  for (const batch of batches) {
    try {
      const batchResults = await startBatchAnalysis(batch, getToken());
      
      // 結果をマージ
      Object.entries(batchResults).forEach(([id, result]) => {
        allResults.set(id, result);
      });
      
      // バッチ間で待機（レート制限対応）
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`バッチ処理エラー:`, error);
      // 失敗したバッチのブックマークにフォールバック結果を設定
      batch.forEach(id => {
        allResults.set(id, {
          suggestedCategories: [{ categoryName: '未分類', confidence: 0.5 }],
          suggestedTags: [],
          sentiment: 'neutral',
          language: 'unknown',
          topics: []
        });
      });
    }
  }
  
  return allResults;
};
```

## トラブルシューティング

### よくある問題

#### 1. 認証エラー (401)

**原因:** JWTトークンが無効または期限切れ

**解決策:**
```typescript
// トークンの更新
const refreshToken = async () => {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include'
  });
  
  if (response.ok) {
    const { token } = await response.json();
    localStorage.setItem('token', token);
    return token;
  }
  
  throw new Error('Token refresh failed');
};
```

#### 2. AIサービス無効エラー (503)

**原因:** AI機能が無効またはAPIキーが未設定

**解決策:**
- 管理者にAI機能の有効化を依頼
- 環境変数の確認
- ヘルスチェックAPIで状態確認

#### 3. レート制限エラー (429)

**原因:** API呼び出し頻度が制限を超過

**解決策:**
- 指数バックオフによるリトライ
- リクエスト間隔の調整
- バッチサイズの縮小

```typescript
const retryWithBackoff = async (fn: () => Promise<any>, maxRetries: number = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 指数バックオフ
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
};
```

これらのAPIリファレンスとベストプラクティスに従って実装することで、AI分析機能を効果的に活用できます。