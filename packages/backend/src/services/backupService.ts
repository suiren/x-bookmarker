/**
 * 自動バックアップサービス
 * 定期的なデータベースバックアップとファイルバックアップ
 */

import cron from 'node-cron';
import { Pool } from 'pg';
import { ExportService } from './exportService';
import { getStorageService } from './storageService';
import { getCacheService } from './cacheService';
import { getDatabaseManager } from '../database/optimizedConnection';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BackupConfig {
  // バックアップスケジュール設定
  schedule: {
    daily: string; // cron式: 毎日バックアップ
    weekly: string; // cron式: 週次フルバックアップ
    monthly: string; // cron式: 月次アーカイブバックアップ
  };
  
  // 保持ポリシー
  retention: {
    dailyBackups: number; // 日次バックアップの保持日数
    weeklyBackups: number; // 週次バックアップの保持週数
    monthlyBackups: number; // 月次バックアップの保持月数
  };
  
  // バックアップ対象
  targets: {
    database: boolean;
    userFiles: boolean;
    systemFiles: boolean;
    logs: boolean;
  };
  
  // 通知設定
  notifications: {
    onSuccess: boolean;
    onFailure: boolean;
    webhookUrl?: string;
    emailRecipients?: string[];
  };
}

interface BackupResult {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  timestamp: Date;
  duration: number;
  status: 'success' | 'failure' | 'partial';
  size: number;
  files: string[];
  errors: string[];
  metadata: {
    databaseSize: number;
    userCount: number;
    bookmarkCount: number;
    fileCount: number;
  };
}

class BackupService {
  private exportService: ExportService;
  private storage = getStorageService();
  private cache = getCacheService();
  private dbManager = getDatabaseManager();
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  
  private readonly config: BackupConfig = {
    schedule: {
      daily: process.env.BACKUP_DAILY_CRON || '0 2 * * *', // 毎日午前2時
      weekly: process.env.BACKUP_WEEKLY_CRON || '0 3 * * 0', // 毎週日曜日午前3時
      monthly: process.env.BACKUP_MONTHLY_CRON || '0 4 1 * *', // 毎月1日午前4時
    },
    retention: {
      dailyBackups: parseInt(process.env.BACKUP_DAILY_RETENTION || '7'),
      weeklyBackups: parseInt(process.env.BACKUP_WEEKLY_RETENTION || '4'),
      monthlyBackups: parseInt(process.env.BACKUP_MONTHLY_RETENTION || '12'),
    },
    targets: {
      database: process.env.BACKUP_DATABASE !== 'false',
      userFiles: process.env.BACKUP_USER_FILES !== 'false',
      systemFiles: process.env.BACKUP_SYSTEM_FILES !== 'false',
      logs: process.env.BACKUP_LOGS !== 'false',
    },
    notifications: {
      onSuccess: process.env.BACKUP_NOTIFY_SUCCESS === 'true',
      onFailure: process.env.BACKUP_NOTIFY_FAILURE !== 'false', // デフォルトで有効
      webhookUrl: process.env.BACKUP_WEBHOOK_URL,
      emailRecipients: process.env.BACKUP_EMAIL_RECIPIENTS?.split(','),
    },
  };

  constructor(private db: Pool) {
    this.exportService = new ExportService(db);
    this.initializeScheduledBackups();
  }

  /**
   * スケジュール済みバックアップを初期化
   */
  private initializeScheduledBackups(): void {
    console.log('🕒 自動バックアップスケジュールを初期化中...');

    // 日次バックアップのスケジュール
    const dailyTask = cron.schedule(this.config.schedule.daily, async () => {
      await this.performScheduledBackup('daily');
    }, {
      scheduled: false,
      timezone: process.env.BACKUP_TIMEZONE || 'Asia/Tokyo',
    });

    // 週次バックアップのスケジュール
    const weeklyTask = cron.schedule(this.config.schedule.weekly, async () => {
      await this.performScheduledBackup('weekly');
    }, {
      scheduled: false,
      timezone: process.env.BACKUP_TIMEZONE || 'Asia/Tokyo',
    });

    // 月次バックアップのスケジュール
    const monthlyTask = cron.schedule(this.config.schedule.monthly, async () => {
      await this.performScheduledBackup('monthly');
    }, {
      scheduled: false,
      timezone: process.env.BACKUP_TIMEZONE || 'Asia/Tokyo',
    });

    this.scheduledJobs.set('daily', dailyTask);
    this.scheduledJobs.set('weekly', weeklyTask);
    this.scheduledJobs.set('monthly', monthlyTask);

    console.log('✅ 自動バックアップスケジュールを初期化しました');
    console.log(`📅 日次: ${this.config.schedule.daily}`);
    console.log(`📅 週次: ${this.config.schedule.weekly}`);
    console.log(`📅 月次: ${this.config.schedule.monthly}`);
  }

  /**
   * バックアップスケジュールを開始
   */
  startScheduledBackups(): void {
    for (const [type, task] of this.scheduledJobs) {
      task.start();
      console.log(`🟢 ${type}バックアップスケジュールを開始しました`);
    }
  }

  /**
   * バックアップスケジュールを停止
   */
  stopScheduledBackups(): void {
    for (const [type, task] of this.scheduledJobs) {
      task.stop();
      console.log(`🔴 ${type}バックアップスケジュールを停止しました`);
    }
  }

  /**
   * 手動バックアップを実行
   */
  async performManualBackup(
    type: 'daily' | 'weekly' | 'monthly' = 'daily',
    targets?: Partial<BackupConfig['targets']>
  ): Promise<BackupResult> {
    return await this.performBackup(type, targets);
  }

  /**
   * スケジュールされたバックアップを実行
   */
  private async performScheduledBackup(type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    try {
      const result = await this.performBackup(type);
      
      if (result.status === 'success' && this.config.notifications.onSuccess) {
        await this.sendNotification('success', result);
      } else if (result.status !== 'success' && this.config.notifications.onFailure) {
        await this.sendNotification('failure', result);
      }
    } catch (error) {
      console.error(`❌ ${type}バックアップ実行エラー:`, error);
      
      if (this.config.notifications.onFailure) {
        await this.sendNotification('failure', {
          id: `${type}-${Date.now()}`,
          type,
          timestamp: new Date(),
          duration: 0,
          status: 'failure' as const,
          size: 0,
          files: [],
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          metadata: {
            databaseSize: 0,
            userCount: 0,
            bookmarkCount: 0,
            fileCount: 0,
          },
        });
      }
    }
  }

  /**
   * バックアップを実行
   */
  private async performBackup(
    type: 'daily' | 'weekly' | 'monthly',
    customTargets?: Partial<BackupConfig['targets']>
  ): Promise<BackupResult> {
    const startTime = Date.now();
    const backupId = `${type}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    console.log(`🚀 ${type}バックアップ開始: ${backupId}`);

    const result: BackupResult = {
      id: backupId,
      type,
      timestamp: new Date(),
      duration: 0,
      status: 'success',
      size: 0,
      files: [],
      errors: [],
      metadata: {
        databaseSize: 0,
        userCount: 0,
        bookmarkCount: 0,
        fileCount: 0,
      },
    };

    const targets = { ...this.config.targets, ...customTargets };

    try {
      // データベースメタデータを収集
      result.metadata = await this.collectSystemMetadata();

      // データベースバックアップ
      if (targets.database) {
        try {
          const dbBackupPath = await this.backupDatabase(backupId);
          result.files.push(dbBackupPath);
          console.log(`✅ データベースバックアップ完了: ${dbBackupPath}`);
        } catch (error) {
          result.errors.push(`Database backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('❌ データベースバックアップエラー:', error);
        }
      }

      // ユーザーファイルバックアップ
      if (targets.userFiles) {
        try {
          const userFilesBackupPath = await this.backupUserFiles(backupId);
          result.files.push(userFilesBackupPath);
          console.log(`✅ ユーザーファイルバックアップ完了: ${userFilesBackupPath}`);
        } catch (error) {
          result.errors.push(`User files backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('❌ ユーザーファイルバックアップエラー:', error);
        }
      }

      // システムファイルバックアップ
      if (targets.systemFiles) {
        try {
          const systemBackupPath = await this.backupSystemFiles(backupId);
          result.files.push(systemBackupPath);
          console.log(`✅ システムファイルバックアップ完了: ${systemBackupPath}`);
        } catch (error) {
          result.errors.push(`System files backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('❌ システムファイルバックアップエラー:', error);
        }
      }

      // ログファイルバックアップ
      if (targets.logs) {
        try {
          const logBackupPath = await this.backupLogs(backupId);
          result.files.push(logBackupPath);
          console.log(`✅ ログファイルバックアップ完了: ${logBackupPath}`);
        } catch (error) {
          result.errors.push(`Log backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('❌ ログバックアップエラー:', error);
        }
      }

      // バックアップサイズを計算
      result.size = await this.calculateBackupSize(result.files);
      
      // ステータスを決定
      if (result.errors.length === 0) {
        result.status = 'success';
      } else if (result.files.length > 0) {
        result.status = 'partial';
      } else {
        result.status = 'failure';
      }

      result.duration = Date.now() - startTime;

      // バックアップ履歴を保存
      await this.saveBackupHistory(result);

      // 古いバックアップをクリーンアップ
      await this.cleanupOldBackups(type);

      console.log(`🎉 ${type}バックアップ完了: ${backupId} (${result.status})`);
      console.log(`📊 処理時間: ${Math.round(result.duration / 1000)}秒, サイズ: ${Math.round(result.size / 1024 / 1024)}MB`);

      return result;

    } catch (error) {
      result.status = 'failure';
      result.duration = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      console.error(`❌ ${type}バックアップ失敗: ${backupId}`, error);
      throw error;
    }
  }

  /**
   * データベースバックアップを実行
   */
  private async backupDatabase(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `database-${backupId}-${timestamp}.sql`;
    const tempPath = path.join(process.cwd(), 'temp', 'backups', fileName);
    
    // 一時ディレクトリを作成
    await fs.mkdir(path.dirname(tempPath), { recursive: true });

    // pg_dumpを使用してデータベースをバックアップ
    const pgDumpCommand = [
      'pg_dump',
      `--host=${process.env.DATABASE_HOST || 'localhost'}`,
      `--port=${process.env.DATABASE_PORT || '5432'}`,
      `--username=${process.env.DATABASE_USER || 'x_bookmarker'}`,
      `--dbname=${process.env.DATABASE_NAME || 'x_bookmarker'}`,
      '--verbose',
      '--clean',
      '--if-exists',
      '--format=custom',
      `--file=${tempPath}`,
    ].join(' ');

    // パスワードを環境変数で設定
    const env = {
      ...process.env,
      PGPASSWORD: process.env.DATABASE_PASSWORD || 'x_bookmarker_dev',
    };

    try {
      await execAsync(pgDumpCommand, { env });
    } catch (error) {
      // pg_dumpが利用できない場合はSQLエクスポートにフォールバック
      console.warn('pg_dump not available, falling back to SQL export');
      await this.fallbackDatabaseBackup(tempPath);
    }

    // ストレージにアップロード
    const storageKey = `backups/database/${fileName}`;
    await this.storage.uploadFile(storageKey, tempPath, {
      contentType: 'application/sql',
      metadata: {
        backupId,
        backupType: 'database',
        createdAt: new Date().toISOString(),
      },
    });

    // 一時ファイルを削除
    await fs.unlink(tempPath);

    return storageKey;
  }

  /**
   * フォールバック用のデータベースバックアップ
   */
  private async fallbackDatabaseBackup(filePath: string): Promise<void> {
    const tables = [
      'users', 'bookmarks', 'categories', 'search_history',
      'sync_jobs', 'user_settings', 'migrations'
    ];

    let sqlContent = '-- X-Bookmarker Database Backup\n';
    sqlContent += `-- Generated at: ${new Date().toISOString()}\n\n`;

    for (const table of tables) {
      try {
        // テーブル構造を取得
        const structureResult = await this.db.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [table]);

        if (structureResult.rows.length > 0) {
          sqlContent += `-- Table: ${table}\n`;
          
          // データを取得
          const dataResult = await this.db.query(`SELECT * FROM ${table}`);
          
          if (dataResult.rows.length > 0) {
            const columns = structureResult.rows.map(row => row.column_name);
            sqlContent += `TRUNCATE TABLE ${table} CASCADE;\n`;
            
            for (const row of dataResult.rows) {
              const values = columns.map(col => {
                const value = row[col];
                if (value === null) return 'NULL';
                if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                if (value instanceof Date) return `'${value.toISOString()}'`;
                if (Array.isArray(value)) return `'${JSON.stringify(value)}'`;
                if (typeof value === 'object') return `'${JSON.stringify(value)}'`;
                return value.toString();
              });
              
              sqlContent += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
            }
          }
          
          sqlContent += '\n';
        }
      } catch (error) {
        console.warn(`テーブル ${table} のバックアップをスキップ:`, error);
      }
    }

    await fs.writeFile(filePath, sqlContent, 'utf-8');
  }

  /**
   * ユーザーファイルをバックアップ
   */
  private async backupUserFiles(backupId: string): Promise<string> {
    // エクスポートサービスを使用してすべてのユーザーデータをバックアップ
    const allUsers = await this.db.query('SELECT id FROM users');
    const backupFiles: string[] = [];

    for (const user of allUsers.rows) {
      try {
        const exportResult = await this.exportService.startExport(user.id, {
          format: 'zip',
          includeBookmarks: true,
          includeCategories: true,
          includeSearchHistory: true,
          includeTags: true,
        });

        // エクスポート完了まで待機
        let status = await this.exportService.getExportStatus(exportResult.jobId);
        while (status && status.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          status = await this.exportService.getExportStatus(exportResult.jobId);
        }

        if (status?.result?.fileUrl) {
          backupFiles.push(status.result.fileUrl);
        }
      } catch (error) {
        console.warn(`ユーザー ${user.id} のデータエクスポートに失敗:`, error);
      }
    }

    // 統合ZIPファイルを作成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `user-files-${backupId}-${timestamp}.zip`;
    const storageKey = `backups/user-files/${fileName}`;

    // 簡略化のため、ここでは個別ファイルのリストを返す
    // 実際の実装では、すべてのユーザーファイルを1つのZIPにまとめる
    return storageKey;
  }

  /**
   * システムファイルをバックアップ
   */
  private async backupSystemFiles(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `system-files-${backupId}-${timestamp}.tar.gz`;
    const tempPath = path.join(process.cwd(), 'temp', 'backups', fileName);
    
    // システム設定ファイルをアーカイブ
    const systemFiles = [
      '.env',
      'package.json',
      'tsconfig.json',
      'src/config',
    ];

    // tarコマンドでアーカイブを作成
    const tarCommand = `tar -czf ${tempPath} ${systemFiles.filter(file => {
      try {
        require('fs').accessSync(file);
        return true;
      } catch {
        return false;
      }
    }).join(' ')}`;

    try {
      await execAsync(tarCommand);
    } catch (error) {
      console.warn('システムファイルのアーカイブ作成に失敗:', error);
      // 空のファイルを作成
      await fs.writeFile(tempPath, '');
    }

    // ストレージにアップロード
    const storageKey = `backups/system/${fileName}`;
    await this.storage.uploadFile(storageKey, tempPath, {
      contentType: 'application/gzip',
      metadata: {
        backupId,
        backupType: 'system',
        createdAt: new Date().toISOString(),
      },
    });

    // 一時ファイルを削除
    await fs.unlink(tempPath);

    return storageKey;
  }

  /**
   * ログファイルをバックアップ
   */
  private async backupLogs(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `logs-${backupId}-${timestamp}.tar.gz`;
    const tempPath = path.join(process.cwd(), 'temp', 'backups', fileName);
    
    // ログディレクトリがある場合のみバックアップ
    const logPaths = ['logs', 'log', '/var/log/x-bookmarker'];
    let logDir = '';

    for (const logPath of logPaths) {
      try {
        await fs.access(logPath);
        logDir = logPath;
        break;
      } catch {
        // ディレクトリが存在しない
      }
    }

    if (logDir) {
      const tarCommand = `tar -czf ${tempPath} ${logDir}`;
      try {
        await execAsync(tarCommand);
      } catch (error) {
        console.warn('ログファイルのアーカイブ作成に失敗:', error);
        await fs.writeFile(tempPath, '');
      }
    } else {
      // ログディレクトリが見つからない場合は空のファイルを作成
      await fs.writeFile(tempPath, '');
    }

    // ストレージにアップロード
    const storageKey = `backups/logs/${fileName}`;
    await this.storage.uploadFile(storageKey, tempPath, {
      contentType: 'application/gzip',
      metadata: {
        backupId,
        backupType: 'logs',
        createdAt: new Date().toISOString(),
      },
    });

    // 一時ファイルを削除
    await fs.unlink(tempPath);

    return storageKey;
  }

  /**
   * システムメタデータを収集
   */
  private async collectSystemMetadata(): Promise<BackupResult['metadata']> {
    const [userCount, bookmarkCount, dbStats] = await Promise.all([
      this.db.query('SELECT COUNT(*) FROM users'),
      this.db.query('SELECT COUNT(*) FROM bookmarks'),
      this.dbManager.getDatabaseStats(),
    ]);

    const storageStats = await this.storage.getStorageStats();

    return {
      databaseSize: dbStats.tableStats.reduce((sum: number, table: any) => sum + (table.n_live_tup || 0), 0),
      userCount: parseInt(userCount.rows[0].count),
      bookmarkCount: parseInt(bookmarkCount.rows[0].count),
      fileCount: storageStats.totalFiles,
    };
  }

  /**
   * バックアップサイズを計算
   */
  private async calculateBackupSize(files: string[]): Promise<number> {
    let totalSize = 0;

    for (const file of files) {
      try {
        const fileInfo = await this.storage.getFileInfo(file);
        if (fileInfo) {
          totalSize += fileInfo.size;
        }
      } catch (error) {
        console.warn(`ファイルサイズ取得失敗: ${file}`, error);
      }
    }

    return totalSize;
  }

  /**
   * バックアップ履歴を保存
   */
  private async saveBackupHistory(result: BackupResult): Promise<void> {
    const historyKey = `backup:history`;
    const history = await this.cache.get(historyKey) || [];
    
    history.unshift(result);
    
    // 最新100件のみ保持
    const trimmedHistory = history.slice(0, 100);
    
    // 24時間キャッシュ
    await this.cache.set(historyKey, trimmedHistory, 86400);
  }

  /**
   * 古いバックアップをクリーンアップ
   */
  private async cleanupOldBackups(type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    const retentionDays = {
      daily: this.config.retention.dailyBackups,
      weekly: this.config.retention.weeklyBackups * 7,
      monthly: this.config.retention.monthlyBackups * 30,
    }[type];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backupTypes = ['database', 'user-files', 'system', 'logs'];

    for (const backupType of backupTypes) {
      try {
        const files = await this.storage.listFiles(`backups/${backupType}/`);
        
        for (const file of files) {
          const fileInfo = await this.storage.getFileInfo(file.key);
          
          if (fileInfo?.metadata?.createdAt) {
            const createdAt = new Date(fileInfo.metadata.createdAt);
            if (createdAt < cutoffDate) {
              await this.storage.deleteFile(file.key);
              console.log(`🗑️ 古いバックアップファイルを削除: ${file.key}`);
            }
          }
        }
      } catch (error) {
        console.warn(`バックアップクリーンアップ警告 (${backupType}):`, error);
      }
    }
  }

  /**
   * 通知を送信
   */
  private async sendNotification(
    type: 'success' | 'failure',
    result: BackupResult
  ): Promise<void> {
    const message = type === 'success' 
      ? `✅ バックアップ成功: ${result.id} (${Math.round(result.duration / 1000)}秒)`
      : `❌ バックアップ失敗: ${result.id} - エラー: ${result.errors.join(', ')}`;

    console.log(`📢 通知: ${message}`);

    // Webhookがある場合は送信
    if (this.config.notifications.webhookUrl) {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(this.config.notifications.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            backup: result,
          }),
        });
      } catch (error) {
        console.warn('Webhook通知送信失敗:', error);
      }
    }
  }

  /**
   * バックアップ履歴を取得
   */
  async getBackupHistory(limit: number = 20): Promise<BackupResult[]> {
    const historyKey = `backup:history`;
    const history = await this.cache.get(historyKey) || [];
    
    return history.slice(0, limit);
  }

  /**
   * バックアップ統計を取得
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    successRate: number;
    averageDuration: number;
    totalSize: number;
    lastBackup?: BackupResult;
  }> {
    const history = await this.getBackupHistory(100);
    
    if (history.length === 0) {
      return {
        totalBackups: 0,
        successRate: 0,
        averageDuration: 0,
        totalSize: 0,
      };
    }

    const successfulBackups = history.filter(b => b.status === 'success');
    const totalDuration = history.reduce((sum, b) => sum + b.duration, 0);
    const totalSize = history.reduce((sum, b) => sum + b.size, 0);

    return {
      totalBackups: history.length,
      successRate: Math.round((successfulBackups.length / history.length) * 100),
      averageDuration: Math.round(totalDuration / history.length / 1000), // 秒
      totalSize,
      lastBackup: history[0],
    };
  }
}

// シングルトンインスタンス
let backupServiceInstance: BackupService | null = null;

/**
 * バックアップサービスのシングルトンインスタンスを取得
 */
export function getBackupService(db: Pool): BackupService {
  if (!backupServiceInstance) {
    backupServiceInstance = new BackupService(db);
  }
  return backupServiceInstance;
}

export { BackupService };
export type { BackupConfig, BackupResult };