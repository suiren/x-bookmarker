/**
 * データインポートサービス
 * 他サービス（Twitter、Chrome、Firefox等）からのブックマークインポート
 */

import { Pool } from 'pg';
import { getQueueManager } from '../queue/optimizedQueue';
import { getCacheService } from './cacheService';
import { getStorageService } from './storageService';
import { parse as parseCSV } from 'csv-parse';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

interface ImportOptions {
  source: 'x-bookmarker' | 'twitter' | 'chrome' | 'firefox' | 'csv' | 'json';
  duplicateStrategy: 'skip' | 'update' | 'create_duplicate';
  defaultCategory?: string;
  validate: boolean;
  dryRun?: boolean; // 実際にインポートせずに検証のみ
}

interface ImportJobStatus {
  jobId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
  };
  result?: {
    totalProcessed: number;
    imported: number;
    skipped: number;
    errors: number;
    warnings: string[];
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedRecords: number;
  detectedFormat: string;
  preview: any[];
}

interface ImportedRecord {
  originalData: any;
  normalizedData: any;
  status: 'imported' | 'skipped' | 'error';
  error?: string;
  hash: string;
}

class ImportService {
  private queueManager = getQueueManager();
  private cache = getCacheService();
  private storage = getStorageService();

  constructor(private db: Pool) {
    this.setupImportProcessor();
  }

  /**
   * ファイルの事前検証
   */
  async validateImportFile(
    filePath: string,
    source: ImportOptions['source']
  ): Promise<ImportValidationResult> {
    console.log(`🔍 インポートファイル検証開始: ${path.basename(filePath)}`);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      switch (source) {
        case 'json':
          return await this.validateJSONFile(fileContent);
        case 'csv':
          return await this.validateCSVFile(fileContent);
        case 'chrome':
          return await this.validateChromeBookmarks(fileContent);
        case 'firefox':
          return await this.validateFirefoxBookmarks(fileContent);
        case 'x-bookmarker':
          return await this.validateXBookmarkerExport(fileContent);
        default:
          throw new Error(`Unsupported import source: ${source}`);
      }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
        estimatedRecords: 0,
        detectedFormat: 'unknown',
        preview: [],
      };
    }
  }

  /**
   * インポートジョブを開始
   */
  async startImport(
    userId: string,
    filePath: string,
    options: ImportOptions
  ): Promise<{ jobId: string }> {
    console.log(`📥 インポート開始: ユーザー ${userId}`);

    // ファイル検証
    const validation = await this.validateImportFile(filePath, options.source);
    if (!validation.valid) {
      throw new Error(`Invalid import file: ${validation.errors.join(', ')}`);
    }

    const jobId = crypto.randomUUID();

    // ファイルをストレージに保存（一時的に）
    const storageKey = `imports/${userId}/${jobId}/${path.basename(filePath)}`;
    await this.storage.uploadFile(storageKey, filePath, {
      contentType: this.getContentTypeFromSource(options.source),
      metadata: {
        userId,
        jobId,
        source: options.source,
        uploadedAt: new Date().toISOString(),
      },
    });

    // インポートジョブをキューに追加
    await this.queueManager.addJob(
      'data-import',
      'import-user-data',
      {
        jobId,
        userId,
        storageKey,
        options,
        validation,
      },
      {
        priority: 7, // 高優先度
        attempts: 2,
      }
    );

    // 初期ステータスをキャッシュに保存
    const initialStatus: ImportJobStatus = {
      jobId,
      userId,
      status: 'pending',
      progress: {
        current: 0,
        total: validation.estimatedRecords,
        percentage: 0,
        currentStep: 'インポートの準備中...',
      },
      createdAt: new Date(),
    };

    await this.cache.set(`import:status:${jobId}`, initialStatus, 3600);

    return { jobId };
  }

  /**
   * インポートジョブのステータスを取得
   */
  async getImportStatus(jobId: string): Promise<ImportJobStatus | null> {
    return await this.cache.get(`import:status:${jobId}`);
  }

  /**
   * ユーザーのインポート履歴を取得
   */
  async getImportHistory(
    userId: string,
    limit: number = 10
  ): Promise<ImportJobStatus[]> {
    const historyKey = `import:history:${userId}`;
    const history = await this.cache.get(historyKey) || [];
    
    return history
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * インポートプロセッサーの設定
   */
  private setupImportProcessor(): void {
    this.queueManager.process('data-import', 'import-user-data', async (job) => {
      const { jobId, userId, storageKey, options, validation } = job.data;

      try {
        console.log(`🔄 インポート処理開始: ${jobId}`);

        await this.updateJobStatus(jobId, {
          status: 'processing',
          progress: {
            current: 0,
            total: validation.estimatedRecords,
            percentage: 0,
            currentStep: 'ファイルを読み込み中...',
          },
        });

        // ストレージからファイルをダウンロード
        const tempDir = path.join(process.cwd(), 'temp', 'imports', jobId);
        await fs.mkdir(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, 'import-file');
        
        await this.storage.downloadFile(storageKey, tempFilePath);

        // ファイルの解析とデータ正規化
        const records = await this.parseImportFile(tempFilePath, options.source, jobId);

        // データのインポート実行
        const result = await this.processImportRecords(userId, records, options, jobId);

        // 完了ステータス更新
        await this.updateJobStatus(jobId, {
          status: 'completed',
          progress: {
            current: result.totalProcessed,
            total: result.totalProcessed,
            percentage: 100,
            currentStep: '完了',
          },
          result,
          completedAt: new Date(),
        });

        // インポート履歴に追加
        await this.addToImportHistory(userId, jobId);

        // 一時ファイルとストレージからファイルを削除
        try {
          await fs.unlink(tempFilePath);
          await fs.rmdir(tempDir);
          await this.storage.deleteFile(storageKey);
        } catch (error) {
          console.warn('ファイル削除警告:', error);
        }

        console.log(`✅ インポート完了: ${jobId}`);
        return result;

      } catch (error) {
        console.error(`❌ インポートエラー: ${jobId}`, error);

        await this.updateJobStatus(jobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    });
  }

  /**
   * インポートファイルを解析
   */
  private async parseImportFile(
    filePath: string,
    source: ImportOptions['source'],
    jobId: string
  ): Promise<ImportedRecord[]> {
    const fileContent = await fs.readFile(filePath, 'utf-8');

    await this.updateJobStatus(jobId, {
      progress: {
        current: 0,
        total: 100,
        percentage: 10,
        currentStep: 'データを解析中...',
      },
    });

    switch (source) {
      case 'json':
        return await this.parseJSONImport(fileContent);
      case 'csv':
        return await this.parseCSVImport(fileContent);
      case 'chrome':
        return await this.parseChromeBookmarks(fileContent);
      case 'firefox':
        return await this.parseFirefoxBookmarks(fileContent);
      case 'x-bookmarker':
        return await this.parseXBookmarkerExport(fileContent);
      default:
        throw new Error(`Unsupported import source: ${source}`);
    }
  }

  /**
   * インポートレコードを処理
   */
  private async processImportRecords(
    userId: string,
    records: ImportedRecord[],
    options: ImportOptions,
    jobId: string
  ): Promise<{
    totalProcessed: number;
    imported: number;
    skipped: number;
    errors: number;
    warnings: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const warnings: string[] = [];

    const batchSize = 50;
    const totalBatches = Math.ceil(records.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batch = records.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
      
      await this.updateJobStatus(jobId, {
        progress: {
          current: batchIndex * batchSize,
          total: records.length,
          percentage: Math.round((batchIndex / totalBatches) * 90) + 10, // 10-100%
          currentStep: `バッチ ${batchIndex + 1}/${totalBatches} を処理中...`,
        },
      });

      for (const record of batch) {
        try {
          if (options.dryRun) {
            // ドライランの場合は検証のみ
            const validation = await this.validateRecord(record.normalizedData, userId);
            if (validation.valid) {
              imported++;
            } else {
              skipped++;
              warnings.push(`スキップ: ${validation.reason}`);
            }
            continue;
          }

          // 重複チェック
          const duplicate = await this.checkDuplicate(record.normalizedData, userId);
          
          if (duplicate) {
            switch (options.duplicateStrategy) {
              case 'skip':
                skipped++;
                record.status = 'skipped';
                continue;
              case 'update':
                await this.updateExistingBookmark(duplicate.id, record.normalizedData);
                imported++;
                record.status = 'imported';
                break;
              case 'create_duplicate':
                await this.createNewBookmark(userId, record.normalizedData, options);
                imported++;
                record.status = 'imported';
                break;
            }
          } else {
            // 新規作成
            await this.createNewBookmark(userId, record.normalizedData, options);
            imported++;
            record.status = 'imported';
          }

        } catch (error) {
          errors++;
          record.status = 'error';
          record.error = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(`エラー: ${record.error}`);
        }
      }
    }

    return {
      totalProcessed: records.length,
      imported,
      skipped,
      errors,
      warnings: warnings.slice(0, 50), // 最大50件の警告
    };
  }

  /**
   * JSON形式の検証
   */
  private async validateJSONFile(content: string): Promise<ImportValidationResult> {
    try {
      const data = JSON.parse(content);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!Array.isArray(data) && !data.bookmarks) {
        errors.push('JSON format must be an array or contain a "bookmarks" property');
      }

      const bookmarks = Array.isArray(data) ? data : data.bookmarks || [];
      const preview = bookmarks.slice(0, 5);

      // 基本的なフィールドチェック
      for (let i = 0; i < Math.min(bookmarks.length, 10); i++) {
        const bookmark = bookmarks[i];
        if (!bookmark.content && !bookmark.text && !bookmark.title) {
          warnings.push(`Record ${i + 1}: Missing content/text/title field`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        estimatedRecords: bookmarks.length,
        detectedFormat: 'json',
        preview,
      };
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid JSON format'],
        warnings: [],
        estimatedRecords: 0,
        detectedFormat: 'json',
        preview: [],
      };
    }
  }

  /**
   * CSV形式の検証
   */
  private async validateCSVFile(content: string): Promise<ImportValidationResult> {
    return new Promise((resolve) => {
      const records: any[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      parseCSV(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ',',
      })
        .on('readable', function() {
          let record;
          while (record = this.read()) {
            records.push(record);
            if (records.length >= 10) break; // 最初の10件で検証
          }
        })
        .on('error', (error) => {
          errors.push(`CSV parsing error: ${error.message}`);
        })
        .on('end', () => {
          if (records.length === 0) {
            errors.push('No valid records found in CSV');
          }

          // ヘッダーチェック
          const firstRecord = records[0];
          const requiredFields = ['content', 'text', 'title', 'url'];
          const hasRequiredField = requiredFields.some(field => 
            firstRecord && Object.keys(firstRecord).some(key => 
              key.toLowerCase().includes(field.toLowerCase())
            )
          );

          if (!hasRequiredField) {
            warnings.push('CSV may not contain bookmark content fields');
          }

          resolve({
            valid: errors.length === 0,
            errors,
            warnings,
            estimatedRecords: Math.max(records.length * 10, 100), // 推定
            detectedFormat: 'csv',
            preview: records.slice(0, 5),
          });
        });
    });
  }

  /**
   * Chrome ブックマークファイルの検証
   */
  private async validateChromeBookmarks(content: string): Promise<ImportValidationResult> {
    try {
      const data = JSON.parse(content);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!data.roots) {
        errors.push('Invalid Chrome bookmarks format: missing "roots" property');
      }

      let bookmarkCount = 0;
      const preview: any[] = [];

      const countBookmarks = (node: any) => {
        if (node.type === 'url') {
          bookmarkCount++;
          if (preview.length < 5) {
            preview.push({
              title: node.name,
              url: node.url,
              dateAdded: node.date_added,
            });
          }
        }
        if (node.children) {
          node.children.forEach(countBookmarks);
        }
      };

      if (data.roots) {
        Object.values(data.roots).forEach((root: any) => countBookmarks(root));
      }

      if (bookmarkCount === 0) {
        warnings.push('No bookmarks found in Chrome export');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        estimatedRecords: bookmarkCount,
        detectedFormat: 'chrome',
        preview,
      };
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid Chrome bookmarks JSON format'],
        warnings: [],
        estimatedRecords: 0,
        detectedFormat: 'chrome',
        preview: [],
      };
    }
  }

  /**
   * Firefox ブックマークファイルの検証（HTML形式）
   */
  private async validateFirefoxBookmarks(content: string): Promise<ImportValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!content.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>')) {
      errors.push('Invalid Firefox bookmarks format');
    }

    // 簡単なHTML解析でブックマーク数を推定
    const linkMatches = content.match(/<A HREF=/gi);
    const estimatedRecords = linkMatches ? linkMatches.length : 0;

    if (estimatedRecords === 0) {
      warnings.push('No bookmarks found in Firefox export');
    }

    // プレビュー用に最初の数個のリンクを抽出
    const preview: any[] = [];
    const hrefRegex = /<A HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
    let match;
    let count = 0;

    while ((match = hrefRegex.exec(content)) !== null && count < 5) {
      preview.push({
        title: match[2],
        url: match[1],
      });
      count++;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedRecords,
      detectedFormat: 'firefox',
      preview,
    };
  }

  /**
   * X-Bookmarker エクスポートファイルの検証
   */
  private async validateXBookmarkerExport(content: string): Promise<ImportValidationResult> {
    try {
      const data = JSON.parse(content);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!data.metadata || !data.bookmarks) {
        errors.push('Invalid X-Bookmarker export format');
      }

      const bookmarks = data.bookmarks || [];
      const preview = bookmarks.slice(0, 5);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        estimatedRecords: bookmarks.length,
        detectedFormat: 'x-bookmarker',
        preview,
      };
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid X-Bookmarker export JSON format'],
        warnings: [],
        estimatedRecords: 0,
        detectedFormat: 'x-bookmarker',
        preview: [],
      };
    }
  }

  /**
   * JSON インポートの解析
   */
  private async parseJSONImport(content: string): Promise<ImportedRecord[]> {
    const data = JSON.parse(content);
    const bookmarks = Array.isArray(data) ? data : data.bookmarks || [];

    return bookmarks.map((bookmark: any, index: number) => {
      const normalizedData = this.normalizeBookmarkData(bookmark, 'json');
      return {
        originalData: bookmark,
        normalizedData,
        status: 'imported' as const,
        hash: this.generateRecordHash(normalizedData),
      };
    });
  }

  /**
   * CSV インポートの解析
   */
  private async parseCSVImport(content: string): Promise<ImportedRecord[]> {
    return new Promise((resolve, reject) => {
      const records: ImportedRecord[] = [];

      parseCSV(content, {
        columns: true,
        skip_empty_lines: true,
      })
        .on('readable', function() {
          let record;
          while (record = this.read()) {
            const normalizedData = this.normalizeBookmarkData(record, 'csv');
            records.push({
              originalData: record,
              normalizedData,
              status: 'imported',
              hash: this.generateRecordHash(normalizedData),
            });
          }
        })
        .on('error', reject)
        .on('end', () => resolve(records));
    });
  }

  /**
   * Chrome ブックマークの解析
   */
  private async parseChromeBookmarks(content: string): Promise<ImportedRecord[]> {
    const data = JSON.parse(content);
    const records: ImportedRecord[] = [];

    const extractBookmarks = (node: any, folder: string = '') => {
      if (node.type === 'url') {
        const normalizedData = this.normalizeBookmarkData({
          title: node.name,
          url: node.url,
          dateAdded: node.date_added,
          folder,
        }, 'chrome');

        records.push({
          originalData: node,
          normalizedData,
          status: 'imported',
          hash: this.generateRecordHash(normalizedData),
        });
      }

      if (node.children) {
        const currentFolder = folder ? `${folder}/${node.name}` : node.name;
        node.children.forEach((child: any) => extractBookmarks(child, currentFolder));
      }
    };

    if (data.roots) {
      Object.values(data.roots).forEach((root: any) => extractBookmarks(root));
    }

    return records;
  }

  /**
   * Firefox ブックマークの解析
   */
  private async parseFirefoxBookmarks(content: string): Promise<ImportedRecord[]> {
    const records: ImportedRecord[] = [];
    const hrefRegex = /<A HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
    let match;

    while ((match = hrefRegex.exec(content)) !== null) {
      const normalizedData = this.normalizeBookmarkData({
        title: match[2],
        url: match[1],
      }, 'firefox');

      records.push({
        originalData: { title: match[2], url: match[1] },
        normalizedData,
        status: 'imported',
        hash: this.generateRecordHash(normalizedData),
      });
    }

    return records;
  }

  /**
   * X-Bookmarker エクスポートの解析
   */
  private async parseXBookmarkerExport(content: string): Promise<ImportedRecord[]> {
    const data = JSON.parse(content);
    const bookmarks = data.bookmarks || [];

    return bookmarks.map((bookmark: any) => ({
      originalData: bookmark,
      normalizedData: bookmark, // 既に正規化済み
      status: 'imported' as const,
      hash: this.generateRecordHash(bookmark),
    }));
  }

  /**
   * ブックマークデータの正規化
   */
  private normalizeBookmarkData(data: any, source: string): any {
    const normalized: any = {
      content: data.content || data.text || data.title || data.name || '',
      authorUsername: data.authorUsername || data.author || 'imported',
      authorDisplayName: data.authorDisplayName || data.author || 'Imported User',
      authorAvatarUrl: data.authorAvatarUrl || null,
      mediaUrls: this.normalizeArray(data.mediaUrls || data.media || []),
      links: this.normalizeArray(data.links || data.urls || (data.url ? [data.url] : [])),
      hashtags: this.normalizeArray(data.hashtags || []),
      mentions: this.normalizeArray(data.mentions || []),
      tags: this.normalizeArray(data.tags || []),
      bookmarkedAt: this.parseDate(data.bookmarkedAt || data.dateAdded || data.date) || new Date(),
      isArchived: Boolean(data.isArchived || data.archived),
      // ソース情報を保持
      importSource: source,
      importedAt: new Date(),
    };

    // URLが存在する場合はlinksに追加
    if (data.url && !normalized.links.includes(data.url)) {
      normalized.links.push(data.url);
    }

    return normalized;
  }

  /**
   * 配列の正規化
   */
  private normalizeArray(value: any): string[] {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      // カンマ区切りまたはセミコロン区切りの文字列を配列に変換
      return value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * 日付の解析
   */
  private parseDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
      // Chrome の date_added は microseconds since Unix epoch
      return new Date(value / 1000);
    }
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  /**
   * レコードハッシュの生成（重複検出用）
   */
  private generateRecordHash(data: any): string {
    const hashString = `${data.content}|${data.authorUsername}|${data.bookmarkedAt}`;
    return createHash('sha256').update(hashString).digest('hex').slice(0, 16);
  }

  /**
   * 重複チェック
   */
  private async checkDuplicate(data: any, userId: string): Promise<any | null> {
    // コンテンツと作者による重複チェック
    const result = await this.db.query(`
      SELECT id, content, author_username
      FROM bookmarks
      WHERE user_id = $1 AND content = $2 AND author_username = $3
      LIMIT 1
    `, [userId, data.content, data.authorUsername]);

    return result.rows[0] || null;
  }

  /**
   * レコードの検証
   */
  private async validateRecord(data: any, userId: string): Promise<{ valid: boolean; reason?: string }> {
    if (!data.content || data.content.trim().length === 0) {
      return { valid: false, reason: 'Empty content' };
    }

    if (data.content.length > 2000) {
      return { valid: false, reason: 'Content too long' };
    }

    return { valid: true };
  }

  /**
   * 既存ブックマークの更新
   */
  private async updateExistingBookmark(bookmarkId: string, data: any): Promise<void> {
    await this.db.query(`
      UPDATE bookmarks
      SET 
        content = $2,
        media_urls = $3,
        links = $4,
        hashtags = $5,
        mentions = $6,
        tags = $7,
        updated_at = NOW()
      WHERE id = $1
    `, [
      bookmarkId,
      data.content,
      data.mediaUrls,
      data.links,
      data.hashtags,
      data.mentions,
      data.tags,
    ]);
  }

  /**
   * 新規ブックマークの作成
   */
  private async createNewBookmark(userId: string, data: any, options: ImportOptions): Promise<void> {
    // デフォルトカテゴリの取得
    let categoryId = null;
    if (options.defaultCategory) {
      const categoryResult = await this.db.query(
        'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
        [userId, options.defaultCategory]
      );
      categoryId = categoryResult.rows[0]?.id || null;
    }

    await this.db.query(`
      INSERT INTO bookmarks (
        user_id, content, author_username, author_display_name, author_avatar_url,
        media_urls, links, hashtags, mentions, tags, category_id, bookmarked_at, is_archived
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      userId,
      data.content,
      data.authorUsername,
      data.authorDisplayName,
      data.authorAvatarUrl,
      data.mediaUrls,
      data.links,
      data.hashtags,
      data.mentions,
      data.tags,
      categoryId,
      data.bookmarkedAt,
      data.isArchived,
    ]);
  }

  /**
   * ジョブステータスを更新
   */
  private async updateJobStatus(
    jobId: string,
    updates: Partial<ImportJobStatus>
  ): Promise<void> {
    const currentStatus = await this.cache.get(`import:status:${jobId}`);
    if (currentStatus) {
      const updatedStatus = { ...currentStatus, ...updates };
      await this.cache.set(`import:status:${jobId}`, updatedStatus, 3600);
    }
  }

  /**
   * インポート履歴に追加
   */
  private async addToImportHistory(userId: string, jobId: string): Promise<void> {
    const historyKey = `import:history:${userId}`;
    const history = await this.cache.get(historyKey) || [];
    const jobStatus = await this.cache.get(`import:status:${jobId}`);

    if (jobStatus) {
      history.unshift(jobStatus);
      // 最新20件のみ保持
      const trimmedHistory = history.slice(0, 20);
      await this.cache.set(historyKey, trimmedHistory, 86400); // 24時間
    }
  }

  /**
   * インポートソースからContent-Typeを取得
   */
  private getContentTypeFromSource(source: string): string {
    switch (source) {
      case 'json':
      case 'x-bookmarker':
      case 'chrome':
        return 'application/json';
      case 'csv':
        return 'text/csv';
      case 'firefox':
        return 'text/html';
      default:
        return 'application/octet-stream';
    }
  }
}

export { ImportService };
export type { ImportOptions, ImportJobStatus, ImportValidationResult };