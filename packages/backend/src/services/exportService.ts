/**
 * データエクスポートサービス
 * ブックマーク、カテゴリ、検索履歴をJSON/CSV形式でエクスポート
 */

import { Pool } from 'pg';
import { createObjectCsvWriter } from 'csv-writer';
import { getQueueManager } from '../queue/optimizedQueue';
import { getCacheService } from './cacheService';
import { getStorageService } from './storageService';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';

interface ExportOptions {
  format: 'json' | 'csv' | 'zip';
  includeBookmarks: boolean;
  includeCategories: boolean;
  includeSearchHistory: boolean;
  includeTags: boolean;
  dateRange?: {
    from: Date;
    to: Date;
  };
  categories?: string[]; // 特定カテゴリのみエクスポート
  compressed?: boolean;
}

interface ExportJobStatus {
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
    fileUrl: string;
    fileName: string;
    fileSize: number;
    recordCount: number;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface ExportedData {
  metadata: {
    exportedAt: string;
    userId: string;
    version: string;
    totalRecords: number;
    format: string;
  };
  bookmarks?: any[];
  categories?: any[];
  searchHistory?: any[];
  tags?: string[];
}

class ExportService {
  private queueManager = getQueueManager();
  private cache = getCacheService();
  private storage = getStorageService();

  constructor(private db: Pool) {
    this.setupExportProcessor();
  }

  /**
   * エクスポートジョブを開始
   */
  async startExport(
    userId: string,
    options: ExportOptions
  ): Promise<{ jobId: string }> {
    console.log(`📤 エクスポート開始: ユーザー ${userId}`);
    
    const jobId = crypto.randomUUID();
    
    // エクスポートジョブをキューに追加
    await this.queueManager.addJob(
      'data-export',
      'export-user-data',
      {
        jobId,
        userId,
        options,
      },
      {
        priority: 5, // 中優先度
        attempts: 3,
      }
    );

    // 初期ステータスをキャッシュに保存
    const initialStatus: ExportJobStatus = {
      jobId,
      userId,
      status: 'pending',
      progress: {
        current: 0,
        total: 100,
        percentage: 0,
        currentStep: 'エクスポートの準備中...',
      },
      createdAt: new Date(),
    };

    await this.cache.set(`export:status:${jobId}`, initialStatus, 3600); // 1時間

    return { jobId };
  }

  /**
   * エクスポートジョブのステータスを取得
   */
  async getExportStatus(jobId: string): Promise<ExportJobStatus | null> {
    return await this.cache.get(`export:status:${jobId}`);
  }

  /**
   * ユーザーのエクスポート履歴を取得
   */
  async getExportHistory(
    userId: string,
    limit: number = 10
  ): Promise<ExportJobStatus[]> {
    const historyKey = `export:history:${userId}`;
    const history = await this.cache.get(historyKey) || [];
    
    return history
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * エクスポートプロセッサーの設定
   */
  private setupExportProcessor(): void {
    this.queueManager.process('data-export', 'export-user-data', async (job) => {
      const { jobId, userId, options } = job.data;
      
      try {
        console.log(`🔄 エクスポート処理開始: ${jobId}`);
        
        // ステータス更新
        await this.updateJobStatus(jobId, {
          status: 'processing',
          progress: {
            current: 0,
            total: 100,
            percentage: 0,
            currentStep: 'データの取得中...',
          },
        });

        // データの取得
        const exportData = await this.collectExportData(userId, options, jobId);
        
        // ファイル生成
        const result = await this.generateExportFile(exportData, options, userId, jobId);
        
        // 完了ステータス更新
        await this.updateJobStatus(jobId, {
          status: 'completed',
          progress: {
            current: 100,
            total: 100,
            percentage: 100,
            currentStep: '完了',
          },
          result,
          completedAt: new Date(),
        });

        // エクスポート履歴に追加
        await this.addToExportHistory(userId, jobId);

        console.log(`✅ エクスポート完了: ${jobId}`);
        return result;

      } catch (error) {
        console.error(`❌ エクスポートエラー: ${jobId}`, error);
        
        await this.updateJobStatus(jobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        throw error;
      }
    });
  }

  /**
   * エクスポートデータを収集
   */
  private async collectExportData(
    userId: string,
    options: ExportOptions,
    jobId: string
  ): Promise<ExportedData> {
    const exportData: ExportedData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        userId,
        version: '1.0.0',
        totalRecords: 0,
        format: options.format,
      },
    };

    let totalSteps = 0;
    let currentStep = 0;

    // ステップ数をカウント
    if (options.includeBookmarks) totalSteps++;
    if (options.includeCategories) totalSteps++;
    if (options.includeSearchHistory) totalSteps++;
    if (options.includeTags) totalSteps++;

    // ブックマークデータの取得
    if (options.includeBookmarks) {
      await this.updateJobStatus(jobId, {
        progress: {
          current: Math.round((currentStep / totalSteps) * 100),
          total: 100,
          percentage: Math.round((currentStep / totalSteps) * 100),
          currentStep: 'ブックマークデータを取得中...',
        },
      });

      exportData.bookmarks = await this.getBookmarksForExport(userId, options);
      exportData.metadata.totalRecords += exportData.bookmarks.length;
      currentStep++;
    }

    // カテゴリデータの取得
    if (options.includeCategories) {
      await this.updateJobStatus(jobId, {
        progress: {
          current: Math.round((currentStep / totalSteps) * 100),
          total: 100,
          percentage: Math.round((currentStep / totalSteps) * 100),
          currentStep: 'カテゴリデータを取得中...',
        },
      });

      exportData.categories = await this.getCategoriesForExport(userId);
      exportData.metadata.totalRecords += exportData.categories.length;
      currentStep++;
    }

    // 検索履歴データの取得
    if (options.includeSearchHistory) {
      await this.updateJobStatus(jobId, {
        progress: {
          current: Math.round((currentStep / totalSteps) * 100),
          total: 100,
          percentage: Math.round((currentStep / totalSteps) * 100),
          currentStep: '検索履歴を取得中...',
        },
      });

      exportData.searchHistory = await this.getSearchHistoryForExport(userId);
      exportData.metadata.totalRecords += exportData.searchHistory.length;
      currentStep++;
    }

    // タグデータの取得
    if (options.includeTags) {
      await this.updateJobStatus(jobId, {
        progress: {
          current: Math.round((currentStep / totalSteps) * 100),
          total: 100,
          percentage: Math.round((currentStep / totalSteps) * 100),
          currentStep: 'タグデータを取得中...',
        },
      });

      exportData.tags = await this.getTagsForExport(userId);
      exportData.metadata.totalRecords += exportData.tags.length;
      currentStep++;
    }

    return exportData;
  }

  /**
   * エクスポートファイルを生成
   */
  private async generateExportFile(
    data: ExportedData,
    options: ExportOptions,
    userId: string,
    jobId: string
  ): Promise<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    recordCount: number;
  }> {
    await this.updateJobStatus(jobId, {
      progress: {
        current: 80,
        total: 100,
        percentage: 80,
        currentStep: 'ファイルを生成中...',
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = path.join(process.cwd(), 'temp', userId);
    
    // 一時ディレクトリを作成
    await fs.mkdir(tempDir, { recursive: true });

    let fileName: string;
    let tempFilePath: string;

    switch (options.format) {
      case 'json':
        fileName = `bookmarks-export-${timestamp}.json`;
        tempFilePath = path.join(tempDir, fileName);
        await this.generateJSONFile(data, tempFilePath);
        break;

      case 'csv':
        fileName = `bookmarks-export-${timestamp}.csv`;
        tempFilePath = path.join(tempDir, fileName);
        await this.generateCSVFile(data, tempFilePath);
        break;

      case 'zip':
        fileName = `bookmarks-export-${timestamp}.zip`;
        tempFilePath = path.join(tempDir, fileName);
        await this.generateZIPFile(data, tempFilePath, timestamp);
        break;

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    // ファイルサイズを取得
    const stats = await fs.stat(tempFilePath);
    const fileSize = stats.size;

    // ストレージサービスにアップロード
    const storageKey = `exports/${userId}/${fileName}`;
    const storageFile = await this.storage.uploadFile(storageKey, tempFilePath, {
      contentType: this.getContentType(options.format),
      metadata: {
        userId,
        exportedAt: timestamp,
        recordCount: data.metadata.totalRecords.toString(),
      },
    });

    // 一時ファイルを削除
    try {
      await fs.unlink(tempFilePath);
    } catch (error) {
      console.warn('一時ファイル削除警告:', error);
    }

    return {
      fileUrl: storageFile.url,
      fileName,
      fileSize,
      recordCount: data.metadata.totalRecords,
    };
  }

  /**
   * JSONファイルを生成
   */
  private async generateJSONFile(data: ExportedData, filePath: string): Promise<void> {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonData, 'utf-8');
  }

  /**
   * CSVファイルを生成
   */
  private async generateCSVFile(data: ExportedData, filePath: string): Promise<void> {
    if (!data.bookmarks || data.bookmarks.length === 0) {
      throw new Error('No bookmarks data available for CSV export');
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'content', title: 'Content' },
        { id: 'authorUsername', title: 'Author Username' },
        { id: 'authorDisplayName', title: 'Author Display Name' },
        { id: 'categoryName', title: 'Category' },
        { id: 'tags', title: 'Tags' },
        { id: 'hashtags', title: 'Hashtags' },
        { id: 'mentions', title: 'Mentions' },
        { id: 'links', title: 'Links' },
        { id: 'mediaUrls', title: 'Media URLs' },
        { id: 'bookmarkedAt', title: 'Bookmarked At' },
        { id: 'createdAt', title: 'Created At' },
        { id: 'updatedAt', title: 'Updated At' },
      ],
    });

    // データを平坦化
    const flattenedData = data.bookmarks.map(bookmark => ({
      ...bookmark,
      tags: Array.isArray(bookmark.tags) ? bookmark.tags.join(', ') : bookmark.tags,
      hashtags: Array.isArray(bookmark.hashtags) ? bookmark.hashtags.join(', ') : bookmark.hashtags,
      mentions: Array.isArray(bookmark.mentions) ? bookmark.mentions.join(', ') : bookmark.mentions,
      links: Array.isArray(bookmark.links) ? bookmark.links.join(', ') : bookmark.links,
      mediaUrls: Array.isArray(bookmark.mediaUrls) ? bookmark.mediaUrls.join(', ') : bookmark.mediaUrls,
    }));

    await csvWriter.writeRecords(flattenedData);
  }

  /**
   * ZIPファイルを生成（複数形式を含む）
   */
  private async generateZIPFile(
    data: ExportedData,
    filePath: string,
    timestamp: string
  ): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = require('fs').createWriteStream(filePath);

    archive.pipe(output);

    // JSONファイルを追加
    const jsonData = JSON.stringify(data, null, 2);
    archive.append(jsonData, { name: `bookmarks-${timestamp}.json` });

    // CSVファイルを追加（ブックマークがある場合）
    if (data.bookmarks && data.bookmarks.length > 0) {
      const csvData = await this.generateCSVString(data.bookmarks);
      archive.append(csvData, { name: `bookmarks-${timestamp}.csv` });
    }

    // README.txtを追加
    const readmeContent = this.generateReadmeContent(data);
    archive.append(readmeContent, { name: 'README.txt' });

    await archive.finalize();

    return new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
  }

  /**
   * ブックマークデータを取得
   */
  private async getBookmarksForExport(
    userId: string,
    options: ExportOptions
  ): Promise<any[]> {
    let query = `
      SELECT 
        b.id,
        b.x_tweet_id,
        b.content,
        b.author_username,
        b.author_display_name,
        b.author_avatar_url,
        b.media_urls,
        b.links,
        b.hashtags,
        b.mentions,
        b.tags,
        b.is_archived,
        b.bookmarked_at,
        b.created_at,
        b.updated_at,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    // 日付範囲フィルター
    if (options.dateRange) {
      query += ` AND b.bookmarked_at >= $${paramIndex} AND b.bookmarked_at <= $${paramIndex + 1}`;
      params.push(options.dateRange.from, options.dateRange.to);
      paramIndex += 2;
    }

    // カテゴリフィルター
    if (options.categories && options.categories.length > 0) {
      query += ` AND b.category_id = ANY($${paramIndex})`;
      params.push(options.categories);
      paramIndex++;
    }

    query += ` ORDER BY b.bookmarked_at DESC`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * カテゴリデータを取得
   */
  private async getCategoriesForExport(userId: string): Promise<any[]> {
    const result = await this.db.query(`
      SELECT 
        id,
        name,
        description,
        color,
        icon,
        parent_id,
        "order",
        is_default,
        created_at,
        updated_at
      FROM categories
      WHERE user_id = $1
      ORDER BY "order" ASC, created_at ASC
    `, [userId]);

    return result.rows;
  }

  /**
   * 検索履歴を取得
   */
  private async getSearchHistoryForExport(userId: string): Promise<any[]> {
    const result = await this.db.query(`
      SELECT 
        id,
        query,
        result_count,
        execution_time,
        created_at
      FROM search_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1000
    `, [userId]);

    return result.rows.map(row => ({
      ...row,
      query: JSON.parse(row.query),
    }));
  }

  /**
   * タグデータを取得
   */
  private async getTagsForExport(userId: string): Promise<string[]> {
    const result = await this.db.query(`
      SELECT DISTINCT UNNEST(tags) as tag
      FROM bookmarks
      WHERE user_id = $1 AND tags IS NOT NULL
      ORDER BY tag
    `, [userId]);

    return result.rows.map(row => row.tag).filter(Boolean);
  }

  /**
   * CSV文字列を生成
   */
  private async generateCSVString(bookmarks: any[]): Promise<string> {
    const headers = [
      'ID', 'Content', 'Author Username', 'Author Display Name',
      'Category', 'Tags', 'Hashtags', 'Mentions', 'Links', 'Media URLs',
      'Bookmarked At', 'Created At', 'Updated At'
    ];

    const rows = bookmarks.map(bookmark => [
      bookmark.id,
      bookmark.content?.replace(/"/g, '""') || '',
      bookmark.author_username || '',
      bookmark.author_display_name || '',
      bookmark.category_name || '',
      Array.isArray(bookmark.tags) ? bookmark.tags.join('; ') : '',
      Array.isArray(bookmark.hashtags) ? bookmark.hashtags.join('; ') : '',
      Array.isArray(bookmark.mentions) ? bookmark.mentions.join('; ') : '',
      Array.isArray(bookmark.links) ? bookmark.links.join('; ') : '',
      Array.isArray(bookmark.media_urls) ? bookmark.media_urls.join('; ') : '',
      bookmark.bookmarked_at,
      bookmark.created_at,
      bookmark.updated_at,
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * README.txtの内容を生成
   */
  private generateReadmeContent(data: ExportedData): string {
    const lines = [
      'X-Bookmarker Data Export',
      '========================',
      '',
      `Export Date: ${data.metadata.exportedAt}`,
      `Format: ${data.metadata.format}`,
      `Total Records: ${data.metadata.totalRecords}`,
      `Export Version: ${data.metadata.version}`,
      '',
      'Contents:',
    ];

    if (data.bookmarks) {
      lines.push(`- Bookmarks: ${data.bookmarks.length} records`);
    }
    if (data.categories) {
      lines.push(`- Categories: ${data.categories.length} records`);
    }
    if (data.searchHistory) {
      lines.push(`- Search History: ${data.searchHistory.length} records`);
    }
    if (data.tags) {
      lines.push(`- Tags: ${data.tags.length} unique tags`);
    }

    lines.push('');
    lines.push('File Formats:');
    lines.push('- JSON: Complete data with full structure');
    lines.push('- CSV: Flattened bookmark data for spreadsheet import');
    lines.push('');
    lines.push('For support, please contact: support@x-bookmarker.com');

    return lines.join('\n');
  }

  /**
   * ジョブステータスを更新
   */
  private async updateJobStatus(
    jobId: string,
    updates: Partial<ExportJobStatus>
  ): Promise<void> {
    const currentStatus = await this.cache.get(`export:status:${jobId}`);
    if (currentStatus) {
      const updatedStatus = { ...currentStatus, ...updates };
      await this.cache.set(`export:status:${jobId}`, updatedStatus, 3600);
    }
  }

  /**
   * エクスポート履歴に追加
   */
  private async addToExportHistory(userId: string, jobId: string): Promise<void> {
    const historyKey = `export:history:${userId}`;
    const history = await this.cache.get(historyKey) || [];
    const jobStatus = await this.cache.get(`export:status:${jobId}`);

    if (jobStatus) {
      history.unshift(jobStatus);
      // 最新20件のみ保持
      const trimmedHistory = history.slice(0, 20);
      await this.cache.set(historyKey, trimmedHistory, 86400); // 24時間
    }
  }

  /**
   * エクスポートファイルを削除（クリーンアップ用）
   */
  async cleanupOldExports(userId: string, olderThanDays: number = 7): Promise<number> {
    try {
      // ストレージサービスを使用してクリーンアップ
      const userExportFiles = await this.storage.listFiles(`exports/${userId}/`);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      let deletedCount = 0;
      
      for (const file of userExportFiles) {
        try {
          const fileInfo = await this.storage.getFileInfo(file.key);
          
          // ファイルのメタデータから作成日時を取得
          if (fileInfo?.metadata?.exportedAt) {
            const exportDate = new Date(fileInfo.metadata.exportedAt);
            if (exportDate < cutoffDate) {
              await this.storage.deleteFile(file.key);
              deletedCount++;
              console.log(`🗑️ 古いエクスポートファイルを削除: ${file.key}`);
            }
          }
        } catch (error) {
          console.warn(`ファイル削除警告: ${file.key}`, error);
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.warn(`エクスポートファイルクリーンアップ警告:`, error);
      return 0;
    }
  }

  /**
   * Content-Typeを取得
   */
  private getContentType(format: string): string {
    switch (format) {
      case 'json':
        return 'application/json';
      case 'csv':
        return 'text/csv';
      case 'zip':
        return 'application/zip';
      default:
        return 'application/octet-stream';
    }
  }
}

export { ExportService };
export type { ExportOptions, ExportJobStatus, ExportedData };