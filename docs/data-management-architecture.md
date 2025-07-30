# データ管理アーキテクチャ

## 概要

X Bookmarkerのデータ管理システムは、ユーザーの貴重なブックマークデータを安全に管理し、他のサービスとの相互運用性を実現します。包括的なエクスポート・インポート機能、自動バックアップシステム、そして統合ファイルストレージにより、データの可搬性と安全性を保証します。

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│                Data Management Architecture                 │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Export Service  │ │ Import Service  │ │ Backup Service  │ │
│ │ (Multi-format)  │ │ (Multi-source)  │ │ (Scheduled)     │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ File Storage    │ │ Queue System    │ │ Validation      │ │
│ │ (S3/Local)      │ │ (Bull Queue)    │ │ Engine          │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                    Storage Layer                        │ │
│ │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐    │ │
│ │  │ AWS S3      │ │ Local FS    │ │ Database        │    │ │
│ │  │ (Cloud)     │ │ (Dev/Test)  │ │ (Metadata)      │    │ │
│ │  └─────────────┘ └─────────────┘ └─────────────────┘    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 主要コンポーネント

### 1. エクスポートサービス

**目的**: ユーザーデータの多形式エクスポートと配信

**実装場所**: `src/services/exportService.ts`

#### サポート形式

```typescript
export interface ExportOptions {
  format: 'json' | 'csv' | 'zip';           // 出力形式
  includeArchived?: boolean;                 // アーカイブ含む
  categoryIds?: string[];                    // 特定カテゴリのみ
  tags?: string[];                          // 特定タグのみ
  dateRange?: {                             // 期間指定
    from: string;
    to: string;
  };
  compression?: boolean;                     // 圧縮オプション
}
```

#### JSON エクスポート

```typescript
// 完全な構造化データエクスポート
interface JsonExportStructure {
  metadata: {
    version: string;
    exportedAt: string;
    totalBookmarks: number;
    totalCategories: number;
  };
  categories: Category[];
  bookmarks: Bookmark[];
  settings: UserSettings;
}

async generateJsonExport(userId: string, options: ExportOptions): Promise<string> {
  const [bookmarks, categories, settings] = await Promise.all([
    this.getFilteredBookmarks(userId, options),
    this.getUserCategories(userId),
    this.getUserSettings(userId)
  ]);

  const exportData: JsonExportStructure = {
    metadata: {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      totalBookmarks: bookmarks.length,
      totalCategories: categories.length
    },
    categories,
    bookmarks,
    settings
  };

  return JSON.stringify(exportData, null, 2);
}
```

#### CSV エクスポート

```typescript
// CSVWriter による効率的な出力
import createCsvWriter from 'csv-writer';

async generateCsvExport(bookmarks: Bookmark[]): Promise<string> {
  const csvWriter = createCsvWriter({
    path: this.tempFilePath,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'url', title: 'URL' },
      { id: 'description', title: 'Description' },
      { id: 'categoryName', title: 'Category' },
      { id: 'tags', title: 'Tags' },
      { id: 'bookmarkedAt', title: 'Bookmarked Date' }
    ]
  });

  // データ変換とCSV出力
  const records = bookmarks.map(bookmark => ({
    title: bookmark.title || '',
    url: bookmark.url,
    description: bookmark.description || '',
    categoryName: bookmark.category?.name || 'Uncategorized',
    tags: bookmark.tags.join(', '),
    bookmarkedAt: bookmark.bookmarkedAt
  }));

  await csvWriter.writeRecords(records);
  return fs.readFileSync(this.tempFilePath, 'utf8');
}
```

#### ZIP エクスポート

```typescript
// 複数形式を含む包括的アーカイブ
import archiver from 'archiver';

async generateZipExport(userId: string, options: ExportOptions): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // JSONデータを追加
  const jsonData = await this.generateJsonExport(userId, options);
  archive.append(jsonData, { name: 'bookmarks.json' });
  
  // CSVデータを追加
  const csvData = await this.generateCsvExport(bookmarks);
  archive.append(csvData, { name: 'bookmarks.csv' });
  
  // Chrome形式のHTMLを追加
  const chromeHtml = await this.generateChromeBookmarks(bookmarks);
  archive.append(chromeHtml, { name: 'chrome_bookmarks.html' });
  
  // READMEを追加
  const readme = this.generateReadme(options);
  archive.append(readme, { name: 'README.txt' });
  
  archive.finalize();
  return archive;
}
```

### 2. インポートサービス

**目的**: 各種ソースからのブックマークデータ取り込み

**実装場所**: `src/services/importService.ts`

#### サポートソース

```typescript
export type ImportSource = 
  | 'x-bookmarker'    // 自身のJSONエクスポート
  | 'chrome'          // Chrome Bookmarks
  | 'firefox'         // Firefox JSON
  | 'twitter'         // Twitter Bookmarks  
  | 'csv'             // CSV形式
  | 'json';           // 汎用JSON

export interface ImportOptions {
  source: ImportSource;
  duplicateStrategy: 'skip' | 'update' | 'create_duplicate';
  defaultCategory?: string;
  validate: boolean;
  dryRun: boolean;
}
```

#### Chrome ブックマーク インポート

```typescript
// Chromeのネストした構造を解釈
interface ChromeBookmarkFolder {
  children: (ChromeBookmarkFolder | ChromeBookmark)[];
  date_added: string;
  date_modified: string;
  id: string;
  name: string;
  type: 'folder';
}

async parseChromeBookmarks(htmlContent: string): Promise<ParsedBookmark[]> {
  const $ = cheerio.load(htmlContent);
  const bookmarks: ParsedBookmark[] = [];
  
  const parseFolder = (element: cheerio.Element, categoryPath: string[] = []) => {
    $(element).find('> dt').each((_, dt) => {
      const $dt = $(dt);
      
      // フォルダの処理
      if ($dt.find('> h3').length > 0) {
        const folderName = $dt.find('> h3').text();
        const newPath = [...categoryPath, folderName];
        const $dl = $dt.next('dl');
        if ($dl.length > 0) {
          parseFolder($dl[0], newPath);
        }
      }
      
      // ブックマークの処理
      else if ($dt.find('> a').length > 0) {
        const $link = $dt.find('> a');
        bookmarks.push({
          title: $link.text(),
          url: $link.attr('href') || '',
          description: '',
          category: categoryPath.join(' / ') || 'Imported',
          tags: [],
          addDate: new Date(parseInt($link.attr('add_date') || '0') * 1000)
        });
      }
    });
  };
  
  parseFolder($('dl')[0]);
  return bookmarks;
}
```

#### 重複検出とマージ戦略

```typescript
export class DuplicateResolver {
  async resolveDuplicates(
    newBookmarks: ParsedBookmark[],
    existingBookmarks: Bookmark[],
    strategy: DuplicateStrategy
  ): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    for (const newBookmark of newBookmarks) {
      const duplicate = this.findDuplicate(newBookmark, existingBookmarks);
      
      if (!duplicate) {
        // 新規作成
        await this.createBookmark(newBookmark);
        result.imported++;
      } else {
        switch (strategy) {
          case 'skip':
            result.skipped++;
            break;
            
          case 'update':
            await this.updateBookmark(duplicate.id, newBookmark);
            result.updated++;
            break;
            
          case 'create_duplicate':
            await this.createBookmark({
              ...newBookmark,
              title: `${newBookmark.title} (Imported)`
            });
            result.imported++;
            break;
        }
      }
    }
    
    return result;
  }

  private findDuplicate(
    newBookmark: ParsedBookmark,
    existing: Bookmark[]
  ): Bookmark | null {
    // URL完全一致
    let match = existing.find(b => b.url === newBookmark.url);
    if (match) return match;
    
    // タイトル + ドメイン一致
    const domain = this.extractDomain(newBookmark.url);
    match = existing.find(b => 
      b.title === newBookmark.title && 
      this.extractDomain(b.url) === domain
    );
    
    return match || null;
  }
}
```

### 3. ファイルストレージサービス

**目的**: 統一されたファイル管理とクラウド・ローカル対応

**実装場所**: `src/services/storageService.ts`

#### ストレージプロバイダー抽象化

```typescript
export abstract class StorageProvider {
  abstract uploadFile(key: string, data: Buffer, contentType: string): Promise<string>;
  abstract downloadFile(key: string): Promise<Buffer>;
  abstract deleteFile(key: string): Promise<void>;
  abstract generateSignedUrl(key: string, expiresIn: number): Promise<string>;
  abstract listFiles(prefix: string): Promise<string[]>;
}

// AWS S3 プロバイダー
export class S3StorageProvider extends StorageProvider {
  private s3Client: S3Client;
  private bucketName: string;

  async uploadFile(key: string, data: Buffer, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      ServerSideEncryption: 'AES256'
    });

    await this.s3Client.send(command);
    return `s3://${this.bucketName}/${key}`;
  }

  async generateSignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

// ローカルファイルシステム プロバイダー
export class LocalStorageProvider extends StorageProvider {
  private basePath: string;

  async uploadFile(key: string, data: Buffer): Promise<string> {
    const filePath = path.join(this.basePath, key);
    const dir = path.dirname(filePath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
    
    return `file://${filePath}`;
  }

  async generateSignedUrl(key: string, expiresIn: number): Promise<string> {
    // ローカル用の時限URL（JWTベース）
    const token = jwt.sign(
      { key, exp: Math.floor(Date.now() / 1000) + expiresIn },
      process.env.JWT_SECRET!
    );
    
    return `/api/files/download?token=${token}`;
  }
}
```

### 4. 自動バックアップシステム

**目的**: 定期的なデータバックアップと災害復旧

**実装場所**: `src/services/backupService.ts`

#### スケジュール管理

```typescript
export class BackupService {
  private schedules = new Map<string, cron.ScheduledTask>();

  startScheduledBackups(): void {
    const config = this.getBackupConfig();
    
    // 日次バックアップ (毎日2:00 AM)
    if (config.daily.enabled) {
      const dailyTask = cron.schedule('0 2 * * *', async () => {
        await this.performBackup('daily');
      }, { scheduled: false });
      
      this.schedules.set('daily', dailyTask);
      dailyTask.start();
    }
    
    // 週次バックアップ (日曜日3:00 AM) 
    if (config.weekly.enabled) {
      const weeklyTask = cron.schedule('0 3 * * 0', async () => {
        await this.performBackup('weekly');
      }, { scheduled: false });
      
      this.schedules.set('weekly', weeklyTask);
      weeklyTask.start();
    }
    
    // 月次バックアップ (1日4:00 AM)
    if (config.monthly.enabled) {
      const monthlyTask = cron.schedule('0 4 1 * *', async () => {
        await this.performBackup('monthly');
      }, { scheduled: false });
      
      this.schedules.set('monthly', monthlyTask);
      monthlyTask.start();
    }
  }

  private async performBackup(type: BackupType): Promise<void> {
    console.log(`🗄️ Starting ${type} backup...`);
    
    try {
      // データベース全体のバックアップ
      const dbBackup = await this.createDatabaseBackup();
      
      // ファイルストレージのバックアップ
      const filesBackup = await this.createFilesBackup();
      
      // バックアップメタデータ
      const metadata: BackupMetadata = {
        id: `${type}-${Date.now()}`,
        type,
        createdAt: new Date(),
        databaseSize: dbBackup.size,
        filesSize: filesBackup.size,
        totalSize: dbBackup.size + filesBackup.size
      };
      
      // ストレージに保存
      await this.storageService.uploadFile(
        `backups/${metadata.id}/database.sql`,
        dbBackup.data,
        'application/sql'
      );
      
      await this.storageService.uploadFile(
        `backups/${metadata.id}/files.tar.gz`,
        filesBackup.data,
        'application/gzip'
      );
      
      // 古いバックアップのクリーンアップ
      await this.cleanupOldBackups(type);
      
      console.log(`✅ ${type} backup completed: ${metadata.id}`);
      
    } catch (error) {
      console.error(`❌ ${type} backup failed:`, error);
      // アラート送信（実装依存）
      await this.sendBackupAlert(type, error);
    }
  }
}
```

#### データベースバックアップ

```typescript
async createDatabaseBackup(): Promise<BackupData> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  
  try {
    // pg_dump を使用した包括的バックアップ
    const dumpCommand = [
      'pg_dump',
      '--host', process.env.DATABASE_HOST,
      '--port', process.env.DATABASE_PORT,
      '--username', process.env.DATABASE_USER,
      '--dbname', process.env.DATABASE_NAME,
      '--verbose',
      '--clean',                    // DROP文を含める
      '--if-exists',               // エラー回避
      '--create',                  // CREATE DATABASE文を含める
      '--format=plain',            // テキスト形式
      '--encoding=UTF8'
    ].join(' ');
    
    const { stdout, stderr } = await execPromise(dumpCommand, {
      env: {
        ...process.env,
        PGPASSWORD: process.env.DATABASE_PASSWORD
      }
    });
    
    if (stderr && !stderr.includes('NOTICE')) {
      throw new Error(`pg_dump error: ${stderr}`);
    }
    
    const data = Buffer.from(stdout, 'utf8');
    
    return {
      filename,
      data,
      size: data.length,
      checksum: crypto.createHash('sha256').update(data).digest('hex')
    };
    
  } catch (error) {
    // pg_dump 失敗時のフォールバック: SQL直接実行
    console.warn('pg_dump failed, falling back to SQL export:', error);
    return await this.createSqlBackup();
  }
}
```

## データ検証とセキュリティ

### インポートデータ検証

```typescript
export class DataValidator {
  validateImportData(data: any, source: ImportSource): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // 基本構造検証
    if (!this.hasValidStructure(data, source)) {
      errors.push({
        type: 'INVALID_STRUCTURE',
        message: `Invalid ${source} data structure`
      });
    }
    
    // URL検証
    for (const bookmark of data.bookmarks || []) {
      if (!this.isValidUrl(bookmark.url)) {
        errors.push({
          type: 'INVALID_URL',
          message: `Invalid URL: ${bookmark.url}`,
          bookmark: bookmark.title
        });
      }
    }
    
    // サイズ制限
    const estimatedSize = JSON.stringify(data).length;
    if (estimatedSize > this.MAX_IMPORT_SIZE) {
      errors.push({
        type: 'SIZE_LIMIT_EXCEEDED',
        message: `Import data too large: ${estimatedSize} bytes`
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      stats: this.generateStats(data)
    };
  }
  
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
```

### セキュリティ対策

```typescript
// ファイルアップロード時のセキュリティチェック
export class SecurityValidator {
  validateUploadedFile(file: Express.Multer.File): SecurityValidationResult {
    const checks = {
      fileSize: this.checkFileSize(file),
      mimeType: this.checkMimeType(file),
      content: this.scanContent(file),
      filename: this.validateFilename(file.originalname)
    };
    
    return {
      isSecure: Object.values(checks).every(check => check.passed),
      checks
    };
  }
  
  private scanContent(file: Express.Multer.File): SecurityCheck {
    const content = file.buffer.toString('utf8', 0, Math.min(file.size, 1024));
    
    // 悪意のあるパターンの検出
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i
    ];
    
    const foundPatterns = maliciousPatterns.filter(pattern => 
      pattern.test(content)
    );
    
    return {
      passed: foundPatterns.length === 0,
      message: foundPatterns.length > 0 
        ? 'Potentially malicious content detected'
        : 'Content appears safe'
    };
  }
}
```

## UI統合とユーザー体験

### プログレスバーとリアルタイム更新

```typescript
// フロントエンド: リアルタイム進捗表示
export const ImportProgress: React.FC<{ jobId: string }> = ({ jobId }) => {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  
  useEffect(() => {
    const eventSource = new EventSource(`/api/import/progress/${jobId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
    };
    
    eventSource.onerror = () => {
      eventSource.close();
    };
    
    return () => eventSource.close();
  }, [jobId]);
  
  if (!progress) return <div>Loading...</div>;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span>{progress.currentStep}</span>
        <span>{progress.processed} / {progress.total}</span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      
      {progress.errors.length > 0 && (
        <div className="text-red-600 text-sm">
          {progress.errors.length} errors occurred
        </div>
      )}
    </div>
  );
};
```

## パフォーマンス最適化

### ストリーミング処理

```typescript
// 大容量ファイルのストリーミング処理
export class StreamingProcessor {
  async processLargeImport(
    filePath: string, 
    source: ImportSource
  ): Promise<ImportResult> {
    const readStream = fs.createReadStream(filePath);
    const result: ImportResult = { imported: 0, errors: [], warnings: [] };
    
    return new Promise((resolve, reject) => {
      const processor = this.createProcessor(source);
      
      readStream
        .pipe(processor)
        .on('data', async (bookmark: ParsedBookmark) => {
          try {
            await this.processBookmark(bookmark);
            result.imported++;
          } catch (error) {
            result.errors.push({
              bookmark: bookmark.title,
              error: error.message
            });
          }
        })
        .on('end', () => resolve(result))
        .on('error', reject);
    });
  }
}
```

この包括的なデータ管理システムにより、X Bookmarkerはユーザーの貴重なデータを安全に保護し、他のサービスとの相互運用性を提供します。自動バックアップにより災害時の復旧も保証し、エンタープライズレベルの信頼性を実現しています。