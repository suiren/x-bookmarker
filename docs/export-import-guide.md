# データエクスポート・インポート開発ガイド

## 概要

このガイドでは、X Bookmarkerのデータエクスポート・インポート機能の使用方法と開発方法について詳しく説明します。実際のコード例、APIリファレンス、そして一般的な使用ケースを通じて、効率的なデータ移行とバックアップ戦略を学びます。

## クイックスタート

### 基本的なエクスポート

```typescript
// シンプルなJSONエクスポート
const exportResponse = await fetch('/api/export', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    format: 'json',
    includeArchived: false
  })
});

const { jobId } = await exportResponse.json();

// 進捗を監視
const checkProgress = async () => {
  const response = await fetch(`/api/export/status/${jobId}`);
  const status = await response.json();
  
  if (status.status === 'completed') {
    // ダウンロード
    window.location.href = `/api/files/download/${status.fileId}`;
  }
};
```

### 基本的なインポート

```typescript
// ファイルアップロードによるインポート
const formData = new FormData();
formData.append('file', selectedFile);
formData.append('source', 'chrome');
formData.append('duplicateStrategy', 'skip');

const importResponse = await fetch('/api/import', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const { jobId } = await importResponse.json();
```

## エクスポート機能詳細

### 1. エクスポート形式

#### JSON形式 - 完全なデータ保持

```typescript
interface JsonExportOptions {
  format: 'json';
  includeArchived?: boolean;        // アーカイブ済みブックマークを含む
  categoryIds?: string[];           // 特定カテゴリのみ
  tags?: string[];                  // 特定タグのみ
  dateRange?: {                     // 期間指定
    from: string;                   // ISO 8601形式
    to: string;
  };
  includeSettings?: boolean;        // ユーザー設定を含む
  compression?: boolean;            // Gzip圧縮を適用
}

// 実際の使用例
const advancedExport = await exportService.startExport(userId, {
  format: 'json',
  includeArchived: true,
  categoryIds: ['tech-category-id', 'work-category-id'],
  dateRange: {
    from: '2024-01-01T00:00:00Z',
    to: '2024-12-31T23:59:59Z'
  },
  includeSettings: true,
  compression: true
});
```

出力されるJSONの構造：

```json
{
  "metadata": {
    "version": "1.0.0",
    "exportedAt": "2024-07-29T10:30:00Z",
    "totalBookmarks": 1250,
    "totalCategories": 15,
    "exportOptions": {
      "includeArchived": true,
      "categoryIds": ["tech-category-id"],
      "dateRange": {
        "from": "2024-01-01T00:00:00Z",
        "to": "2024-12-31T23:59:59Z"
      }
    }
  },
  "categories": [
    {
      "id": "tech-category-id",
      "name": "技術・プログラミング",
      "color": "#3B82F6",
      "icon": "code",
      "displayOrder": 1,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-06-15T10:30:00Z"
    }
  ],
  "bookmarks": [
    {
      "id": "bookmark-1",
      "title": "React 18の新機能について",
      "url": "https://example.com/react-18-features",
      "description": "React 18で追加された新機能の詳細解説",
      "categoryId": "tech-category-id",
      "tags": ["react", "javascript", "frontend"],
      "isArchived": false,
      "bookmarkedAt": "2024-03-15T14:20:00Z",
      "updatedAt": "2024-03-15T14:20:00Z",
      "metadata": {
        "previewImage": "https://example.com/preview.jpg",
        "author": "Example Author",
        "publishedAt": "2024-03-10T00:00:00Z"
      }
    }
  ],
  "settings": {
    "theme": "dark",
    "defaultView": "grid",
    "itemsPerPage": 24,
    "autoSync": true
  }
}
```

#### CSV形式 - スプレッドシート互換

```typescript
// CSVエクスポートオプション
interface CsvExportOptions {
  format: 'csv';
  encoding?: 'utf-8' | 'shift-jis';    // 文字エンコーディング
  delimiter?: ',' | ';' | '\t';         // 区切り文字
  includeHeaders?: boolean;             // ヘッダー行を含む
  flattenTags?: boolean;               // タグを単一カラムにまとめる
}

// Excel用の日本語対応CSV
const csvExport = await exportService.startExport(userId, {
  format: 'csv',
  encoding: 'shift-jis',    // Excel互換性
  delimiter: ',',
  includeHeaders: true,
  flattenTags: true
});
```

出力されるCSV形式：

```csv
Title,URL,Description,Category,Tags,Bookmarked Date,Is Archived,Author
"React 18の新機能について","https://example.com/react-18-features","React 18で追加された新機能の詳細解説","技術・プログラミング","react, javascript, frontend","2024-03-15 14:20:00",false,"Example Author"
"Vue.jsベストプラクティス","https://example.com/vue-best-practices","Vue.jsアプリケーション開発のベストプラクティス集","技術・プログラミング","vue, javascript, frontend","2024-03-20 09:15:00",false,"Vue Expert"
```

#### ZIP形式 - 包括的アーカイブ

```typescript
// ZIPエクスポートで複数形式を一括生成
const zipExport = await exportService.startExport(userId, {
  format: 'zip',
  includeFormats: ['json', 'csv', 'chrome', 'firefox'],  // 含める形式
  includeImages?: boolean,      // プレビュー画像を含む
  createReadme?: boolean        // README.txtを生成
});
```

ZIP内容物：
```
bookmarks-export-2024-07-29.zip
├── bookmarks.json              # フル構造データ
├── bookmarks.csv               # スプレッドシート用
├── chrome_bookmarks.html       # Chrome インポート用
├── firefox_bookmarks.json      # Firefox インポート用
├── images/                     # プレビュー画像（オプション）
│   ├── preview_1.jpg
│   └── preview_2.png
└── README.txt                  # インポート手順書
```

### 2. エクスポートジョブの管理

#### 非同期処理の監視

```typescript
export class ExportJobMonitor {
  private eventSource: EventSource | null = null;

  startMonitoring(jobId: string, callbacks: {
    onProgress?: (progress: ExportProgress) => void;
    onComplete?: (result: ExportResult) => void;
    onError?: (error: ExportError) => void;
  }): void {
    // Server-Sent Events による リアルタイム監視
    this.eventSource = new EventSource(`/api/export/progress/${jobId}`);
    
    this.eventSource.onmessage = (event) => {
      const data: ExportProgress = JSON.parse(event.data);
      
      switch (data.status) {
        case 'processing':
          callbacks.onProgress?.(data);
          break;
          
        case 'completed':
          callbacks.onComplete?.(data.result);
          this.cleanup();
          break;
          
        case 'failed':
          callbacks.onError?.(data.error);
          this.cleanup();
          break;
      }
    };
    
    this.eventSource.onerror = () => {
      callbacks.onError?.({ message: 'Connection lost' });
      this.cleanup();
    };
  }

  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// 使用例
const monitor = new ExportJobMonitor();
monitor.startMonitoring(jobId, {
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percentage}% (${progress.currentStep})`);
    updateProgressBar(progress.percentage);
  },
  
  onComplete: (result) => {
    const downloadUrl = `/api/files/download/${result.fileId}`;
    window.location.href = downloadUrl;
  },
  
  onError: (error) => {
    alert(`Export failed: ${error.message}`);
  }
});
```

#### バッチエクスポート

```typescript
// 複数ユーザーの一括エクスポート（管理者機能）
export class BatchExportService {
  async exportMultipleUsers(
    userIds: string[], 
    options: ExportOptions
  ): Promise<BatchExportResult> {
    const results: ExportResult[] = [];
    const errors: BatchExportError[] = [];
    
    // 並行処理数を制限（サーバー負荷を考慮）
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(userIds, concurrencyLimit);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (userId) => {
        try {
          const result = await this.exportService.startExport(userId, options);
          results.push(result);
        } catch (error) {
          errors.push({
            userId,
            error: error.message
          });
        }
      });
      
      await Promise.all(promises);
      
      // サーバー負荷軽減のため小休憩
      await this.sleep(1000);
    }
    
    return { results, errors };
  }
}
```

## インポート機能詳細

### 1. インポートソース別の処理

#### Chrome ブックマーク

```typescript
// Chrome HTML形式の解析
export class ChromeImportParser {
  async parseBookmarks(htmlContent: string): Promise<ParsedBookmark[]> {
    const $ = cheerio.load(htmlContent);
    const bookmarks: ParsedBookmark[] = [];
    
    // ChromeのDT/DD構造を再帰的に解析
    const parseNode = (element: cheerio.Element, categoryPath: string[] = []): void => {
      $(element).children('dt').each((_, dt) => {
        const $dt = $(dt);
        
        // フォルダー（カテゴリ）の処理
        const $h3 = $dt.children('h3');
        if ($h3.length > 0) {
          const folderName = $h3.text().trim();
          const $dl = $dt.next('dl');
          
          if ($dl.length > 0) {
            parseNode($dl[0], [...categoryPath, folderName]);
          }
        }
        
        // ブックマークの処理
        const $a = $dt.children('a');
        if ($a.length > 0) {
          const href = $a.attr('href');
          const title = $a.text().trim();
          const addDate = $a.attr('add_date');
          const icon = $a.attr('icon');
          
          if (href && title) {
            bookmarks.push({
              title,
              url: href,
              description: '',
              category: categoryPath.join(' > ') || 'Imported from Chrome',
              tags: [],
              addDate: addDate ? new Date(parseInt(addDate) * 1000) : new Date(),
              metadata: {
                source: 'chrome',
                originalIcon: icon
              }
            });
          }
        }
      });
    };
    
    // ブックマークバーとその他のブックマークを処理
    $('dl').each((_, dl) => parseNode(dl));
    
    return bookmarks;
  }
}
```

#### Firefox JSON形式

```typescript
// Firefox JSON形式の解析
interface FirefoxBookmark {
  guid: string;
  title: string;
  index: number;
  dateAdded: number;
  lastModified: number;
  id: number;
  type: string;
  root: string;
  children?: FirefoxBookmark[];
  uri?: string;
}

export class FirefoxImportParser {
  async parseBookmarks(jsonContent: string): Promise<ParsedBookmark[]> {
    const data: FirefoxBookmark = JSON.parse(jsonContent);
    const bookmarks: ParsedBookmark[] = [];
    
    const traverse = (node: FirefoxBookmark, categoryPath: string[] = []): void => {
      if (node.children) {
        // フォルダーの場合
        const folderName = node.title || 'Untitled Folder';
        const newPath = node.root ? [] : [...categoryPath, folderName];
        
        node.children.forEach(child => traverse(child, newPath));
      } else if (node.uri) {
        // ブックマークの場合
        bookmarks.push({
          title: node.title || 'Untitled',
          url: node.uri,
          description: '',
          category: categoryPath.join(' > ') || 'Imported from Firefox',
          tags: [],
          addDate: new Date(node.dateAdded / 1000), // Firefox は マイクロ秒
          metadata: {
            source: 'firefox',
            guid: node.guid,
            lastModified: new Date(node.lastModified / 1000)
          }
        });
      }
    };
    
    traverse(data);
    return bookmarks;
  }
}
```

#### CSV形式のカスタマイズ

```typescript
// 柔軟なCSV形式対応
export class CsvImportParser {
  async parseBookmarks(
    csvContent: string, 
    mapping: CsvColumnMapping
  ): Promise<ParsedBookmark[]> {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    return records.map((record: any) => ({
      title: record[mapping.title] || 'Untitled',
      url: record[mapping.url],
      description: record[mapping.description] || '',
      category: record[mapping.category] || 'Imported',
      tags: this.parseTags(record[mapping.tags]),
      addDate: this.parseDate(record[mapping.date]),
      metadata: {
        source: 'csv',
        originalRecord: record
      }
    }));
  }
  
  private parseTags(tagsString: string): string[] {
    if (!tagsString) return [];
    
    // 複数の区切り文字に対応
    return tagsString
      .split(/[,;|]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }
  
  private parseDate(dateString: string): Date {
    if (!dateString) return new Date();
    
    // 複数の日付形式に対応
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,         // MM/DD/YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
    ];
    
    for (const format of formats) {
      if (format.test(dateString)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    return new Date(); // フォールバック
  }
}
```

### 2. 重複処理戦略

#### 高度な重複検出

```typescript
export class AdvancedDuplicateDetector {
  // 複数の基準による重複検出
  async findDuplicates(
    newBookmark: ParsedBookmark,
    existingBookmarks: Bookmark[]
  ): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];
    
    for (const existing of existingBookmarks) {
      const similarity = this.calculateSimilarity(newBookmark, existing);
      
      if (similarity.score > 0.8) {  // 80%以上の類似度
        matches.push({
          bookmark: existing,
          similarity,
          confidence: this.calculateConfidence(similarity)
        });
      }
    }
    
    return matches.sort((a, b) => b.similarity.score - a.similarity.score);
  }
  
  private calculateSimilarity(
    newBookmark: ParsedBookmark, 
    existing: Bookmark
  ): SimilarityScore {
    let score = 0;
    const factors: SimilarityFactor[] = [];
    
    // URL完全一致 (最重要)
    if (newBookmark.url === existing.url) {
      score += 0.6;
      factors.push({ type: 'url_exact', weight: 0.6 });
    } else {
      // ドメイン一致
      const newDomain = this.extractDomain(newBookmark.url);
      const existingDomain = this.extractDomain(existing.url);
      
      if (newDomain === existingDomain) {
        score += 0.2;
        factors.push({ type: 'domain_match', weight: 0.2 });
      }
    }
    
    // タイトル類似度 (レーベンシュタイン距離使用)
    const titleSimilarity = this.calculateLevenshteinSimilarity(
      newBookmark.title.toLowerCase(),
      existing.title.toLowerCase()
    );
    
    if (titleSimilarity > 0.8) {
      score += 0.3 * titleSimilarity;
      factors.push({ 
        type: 'title_similarity', 
        weight: 0.3 * titleSimilarity,
        value: titleSimilarity 
      });
    }
    
    // タグの重複
    const commonTags = this.findCommonTags(newBookmark.tags, existing.tags);
    if (commonTags.length > 0) {
      const tagScore = Math.min(commonTags.length / Math.max(newBookmark.tags.length, existing.tags.length), 0.1);
      score += tagScore;
      factors.push({ 
        type: 'tag_overlap', 
        weight: tagScore,
        value: commonTags.length 
      });
    }
    
    return { score: Math.min(score, 1.0), factors };
  }
}
```

#### スマートマージ戦略

```typescript
export class SmartMergeStrategy {
  async mergeBookmarks(
    existing: Bookmark,
    imported: ParsedBookmark,
    strategy: 'smart' | 'prefer_existing' | 'prefer_imported'
  ): Promise<Bookmark> {
    const merged: Partial<Bookmark> = { ...existing };
    
    switch (strategy) {
      case 'smart':
        // より詳細な情報を優先
        if (imported.description && imported.description.length > existing.description.length) {
          merged.description = imported.description;
        }
        
        // タグをマージ（重複削除）
        const allTags = [...existing.tags, ...imported.tags];
        merged.tags = [...new Set(allTags)];
        
        // より新しい日付を使用
        if (imported.addDate > existing.bookmarkedAt) {
          merged.updatedAt = imported.addDate;
        }
        
        break;
        
      case 'prefer_imported':
        merged.title = imported.title;
        merged.description = imported.description;
        merged.tags = imported.tags;
        merged.updatedAt = imported.addDate;
        break;
        
      case 'prefer_existing':
        // 既存データを保持（更新日のみ変更）
        merged.updatedAt = new Date();
        break;
    }
    
    return merged as Bookmark;
  }
}
```

### 3. バリデーションとエラーハンドリング

#### 包括的なデータ検証

```typescript
export class ImportValidator {
  async validateImportData(
    data: ParsedBookmark[],
    options: ImportOptions
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      stats: {
        totalBookmarks: data.length,
        validUrls: 0,
        invalidUrls: 0,
        duplicatesFound: 0,
        categoriesCreated: 0
      }
    };
    
    const urlValidator = new URLValidator();
    const duplicateDetector = new DuplicateDetector();
    const seenUrls = new Set<string>();
    
    for (let i = 0; i < data.length; i++) {
      const bookmark = data[i];
      const context = { index: i, title: bookmark.title };
      
      // URL検証
      if (!urlValidator.isValid(bookmark.url)) {
        result.errors.push({
          type: 'INVALID_URL',
          message: `Invalid URL: ${bookmark.url}`,
          context
        });
        result.stats.invalidUrls++;
      } else {
        result.stats.validUrls++;
      }
      
      // 重複検証
      if (seenUrls.has(bookmark.url)) {
        result.warnings.push({
          type: 'DUPLICATE_URL',
          message: `Duplicate URL found: ${bookmark.url}`,
          context
        });
        result.stats.duplicatesFound++;
      } else {
        seenUrls.add(bookmark.url);
      }
      
      // タイトル長制限
      if (bookmark.title.length > 255) {
        result.warnings.push({
          type: 'TITLE_TOO_LONG',
          message: `Title exceeds 255 characters: ${bookmark.title.substring(0, 50)}...`,
          context
        });
      }
      
      // 必須フィールド検証
      if (!bookmark.title.trim()) {
        result.errors.push({
          type: 'MISSING_TITLE',
          message: `Bookmark missing title: ${bookmark.url}`,
          context
        });
      }
    }
    
    // エラーが多すぎる場合は無効とする
    if (result.errors.length > data.length * 0.1) { // 10%以上エラー
      result.isValid = false;
      result.errors.unshift({
        type: 'TOO_MANY_ERRORS',
        message: `Too many validation errors: ${result.errors.length}/${data.length}`,
        context: { summary: true }
      });
    }
    
    return result;
  }
}
```

#### リカバリー可能なエラー処理

```typescript
export class RecoverableImportProcessor {
  async processWithRecovery(
    bookmarks: ParsedBookmark[],
    options: ImportOptions
  ): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      recoveries: []
    };
    
    for (const bookmark of bookmarks) {
      try {
        await this.processBookmark(bookmark, options);
        result.imported++;
        
      } catch (error) {
        // リカバリー試行
        const recovery = await this.attemptRecovery(bookmark, error, options);
        
        if (recovery.successful) {
          result.imported++;
          result.recoveries.push({
            originalError: error.message,
            recoveryAction: recovery.action,
            bookmark: bookmark.title
          });
        } else {
          result.errors.push({
            bookmark: bookmark.title,
            error: error.message,
            url: bookmark.url
          });
          result.skipped++;
        }
      }
    }
    
    return result;
  }
  
  private async attemptRecovery(
    bookmark: ParsedBookmark,
    error: Error,
    options: ImportOptions
  ): Promise<RecoveryResult> {
    // URL修正の試行
    if (error.message.includes('Invalid URL')) {
      const fixedUrl = this.attemptUrlFix(bookmark.url);
      if (fixedUrl) {
        try {
          await this.processBookmark({ ...bookmark, url: fixedUrl }, options);
          return { 
            successful: true, 
            action: `URL corrected: ${bookmark.url} → ${fixedUrl}` 
          };
        } catch {
          // 修正も失敗
        }
      }
    }
    
    // カテゴリ作成の試行
    if (error.message.includes('Category not found')) {
      try {
        await this.createMissingCategory(bookmark.category);
        await this.processBookmark(bookmark, options);
        return { 
          successful: true, 
          action: `Created missing category: ${bookmark.category}` 
        };
      } catch {
        // カテゴリ作成も失敗
      }
    }
    
    return { successful: false, action: 'No recovery possible' };
  }
}
```

## 実装パターンとベストプラクティス

### 1. パフォーマンス最適化

#### ストリーミング処理

```typescript
// 大容量ファイルのメモリ効率的処理
export class StreamingImportProcessor {
  async processLargeFile(filePath: string, source: ImportSource): Promise<void> {
    const readStream = fs.createReadStream(filePath);
    const parser = this.createParser(source);
    const batchProcessor = new BatchProcessor(100); // 100件ずつ処理
    
    return new Promise((resolve, reject) => {
      let currentBatch: ParsedBookmark[] = [];
      
      readStream
        .pipe(parser)
        .on('data', (bookmark: ParsedBookmark) => {
          currentBatch.push(bookmark);
          
          if (currentBatch.length >= 100) {
            batchProcessor.add(currentBatch);
            currentBatch = [];
          }
        })
        .on('end', async () => {
          if (currentBatch.length > 0) {
            batchProcessor.add(currentBatch);
          }
          
          await batchProcessor.flush();
          resolve();
        })
        .on('error', reject);
    });
  }
}
```

#### プログレッシブ処理

```typescript
// 段階的処理によるUX向上
export class ProgressiveProcessor {
  async processWithProgress(
    bookmarks: ParsedBookmark[],
    onProgress: (progress: ProcessProgress) => void
  ): Promise<ImportResult> {
    const totalSteps = 4;
    let currentStep = 0;
    
    // Step 1: データ検証
    onProgress({ step: ++currentStep, totalSteps, message: 'Validating data...' });
    const validation = await this.validateData(bookmarks);
    
    // Step 2: 重複検出
    onProgress({ step: ++currentStep, totalSteps, message: 'Detecting duplicates...' });
    const duplicates = await this.detectDuplicates(bookmarks);
    
    // Step 3: カテゴリ準備
    onProgress({ step: ++currentStep, totalSteps, message: 'Preparing categories...' });
    await this.prepareCategories(bookmarks);
    
    // Step 4: インポート実行
    onProgress({ step: ++currentStep, totalSteps, message: 'Importing bookmarks...' });
    const result = await this.executeImport(bookmarks);
    
    return result;
  }
}
```

### 2. エラーハンドリングパターン

#### 段階的エラー処理

```typescript
export class GracefulErrorHandler {
  async handleImportError(error: ImportError, context: ImportContext): Promise<ErrorResolution> {
    // Level 1: 自動修復を試行
    const autoFix = await this.attemptAutoFix(error, context);
    if (autoFix.successful) {
      return { action: 'auto_fixed', message: autoFix.message };
    }
    
    // Level 2: ユーザーに選択肢を提示
    if (this.isUserResolvable(error)) {
      return { 
        action: 'user_input_required', 
        options: this.getUserOptions(error, context) 
      };
    }
    
    // Level 3: スキップして続行
    if (this.isSkippable(error)) {
      await this.logSkippedItem(error, context);
      return { action: 'skipped', message: 'Item skipped due to error' };
    }
    
    // Level 4: 致命的エラー
    throw new FatalImportError(error.message, context);
  }
}
```

### 3. テストパターン

#### 包括的テストスイート

```typescript
describe('Export/Import System', () => {
  describe('Export Functionality', () => {
    it('should export bookmarks to JSON format', async () => {
      const testData = await createTestBookmarks(100);
      const exportJob = await exportService.startExport(testUserId, {
        format: 'json'
      });
      
      const result = await waitForJobCompletion(exportJob.jobId);
      expect(result.status).toBe('completed');
      
      const exportedData = JSON.parse(result.fileContent);
      expect(exportedData.bookmarks).toHaveLength(100);
      expect(exportedData.metadata.version).toBe('1.0.0');
    });
    
    it('should handle large dataset export', async () => {
      const largeDataset = await createTestBookmarks(10000);
      const startTime = Date.now();
      
      const exportJob = await exportService.startExport(testUserId, {
        format: 'json',
        compression: true
      });
      
      const result = await waitForJobCompletion(exportJob.jobId);
      const duration = Date.now() - startTime;
      
      expect(result.status).toBe('completed');
      expect(duration).toBeLessThan(30000); // 30秒以内
    });
  });
  
  describe('Import Functionality', () => {
    it('should import Chrome bookmarks correctly', async () => {
      const chromeHtml = await loadTestFile('chrome_bookmarks.html');
      const importJob = await importService.startImport(testUserId, chromeHtml, {
        source: 'chrome',
        duplicateStrategy: 'skip'
      });
      
      const result = await waitForJobCompletion(importJob.jobId);
      expect(result.imported).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should handle duplicate detection', async () => {
      // 既存データを作成
      await createTestBookmarks(50);
      
      // 重複を含むデータをインポート
      const duplicateData = await createOverlappingTestData(30);
      const importJob = await importService.startImport(testUserId, duplicateData, {
        source: 'json',
        duplicateStrategy: 'skip'
      });
      
      const result = await waitForJobCompletion(importJob.jobId);
      expect(result.skipped).toBeGreaterThan(0);
    });
  });
});
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. メモリ不足エラー

```typescript
// 問題: 大容量ファイルでメモリ不足
// 解決: ストリーミング処理の実装
export class MemoryEfficientProcessor {
  async processLargeImport(filePath: string): Promise<ImportResult> {
    const stream = fs.createReadStream(filePath, { highWaterMark: 16 * 1024 }); // 16KB chunks
    const parser = new StreamingJsonParser();
    
    let processed = 0;
    const batchSize = 100;
    let currentBatch: ParsedBookmark[] = [];
    
    return new Promise((resolve, reject) => {
      stream
        .pipe(parser)
        .on('data', async (bookmark: ParsedBookmark) => {
          currentBatch.push(bookmark);
          
          if (currentBatch.length >= batchSize) {
            await this.processBatch(currentBatch);
            processed += currentBatch.length;
            currentBatch = []; // メモリ解放
            
            // GC を促進
            if (processed % 1000 === 0) {
              global.gc?.();
            }
          }
        })
        .on('end', async () => {
          if (currentBatch.length > 0) {
            await this.processBatch(currentBatch);
          }
          resolve({ imported: processed, errors: [] });
        })
        .on('error', reject);
    });
  }
}
```

#### 2. タイムアウトエラー

```typescript
// 問題: 長時間処理でタイムアウト
// 解決: チェックポイント機能付き処理
export class ResumableProcessor {
  async processWithCheckpoints(
    bookmarks: ParsedBookmark[],
    checkpointInterval: number = 1000
  ): Promise<ImportResult> {
    const checkpointFile = this.getCheckpointPath();
    let startIndex = 0;
    
    // 既存のチェックポイントから再開
    if (fs.existsSync(checkpointFile)) {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      startIndex = checkpoint.processedCount;
    }
    
    for (let i = startIndex; i < bookmarks.length; i++) {
      await this.processBookmark(bookmarks[i]);
      
      // チェックポイント保存
      if (i % checkpointInterval === 0) {
        fs.writeFileSync(checkpointFile, JSON.stringify({
          processedCount: i + 1,
          timestamp: new Date().toISOString()
        }));
      }
    }
    
    // 完了後にチェックポイントファイルを削除
    fs.unlinkSync(checkpointFile);
    
    return { imported: bookmarks.length - startIndex, errors: [] };
  }
}
```

#### 3. 文字エンコーディング問題

```typescript
// 問題: 文字化けや不正な文字エンコーディング
// 解決: 自動エンコーディング検出
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

export class EncodingDetector {
  async readWithCorrectEncoding(filePath: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    
    // エンコーディングを自動検出
    const detected = jschardet.detect(buffer);
    const encoding = detected.encoding || 'utf-8';
    
    console.log(`Detected encoding: ${encoding} (confidence: ${detected.confidence})`);
    
    // 適切なエンコーディングでデコード
    if (iconv.encodingExists(encoding)) {
      return iconv.decode(buffer, encoding);
    } else {
      // フォールバック: UTF-8
      return iconv.decode(buffer, 'utf-8');
    }
  }
}
```

この包括的なガイドにより、X Bookmarkerのデータエクスポート・インポート機能を効率的に活用し、トラブルシューティングも迅速に行うことができます。ユーザーの貴重なデータを安全に移行し、他のサービスとの相互運用性を実現する強力なツールです。