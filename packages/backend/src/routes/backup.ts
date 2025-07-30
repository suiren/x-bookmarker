/**
 * バックアップ管理APIエンドポイント
 * 手動バックアップ実行、履歴確認、統計情報取得
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { getBackupService } from '../services/backupService';
import { authenticateToken } from '../middleware/auth';

const router = Router();
let db: Pool;

/**
 * データベース接続を設定
 */
export function setDatabase(database: Pool) {
  db = database;
}

/**
 * 手動バックアップを実行
 */
router.post('/manual', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const { 
      type = 'daily',
      targets 
    } = req.body;

    // バックアップタイプの検証
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return res.status(400).json({ error: 'Invalid backup type' });
    }

    const backupService = getBackupService(db);
    
    console.log(`🚀 手動バックアップ開始: ${type}`);
    
    // バックアップを非同期で実行
    const backupPromise = backupService.performManualBackup(type, targets);
    
    // すぐにレスポンスを返す（バックアップは背景で実行）
    res.json({
      message: 'Manual backup started',
      type,
      status: 'started',
      timestamp: new Date().toISOString(),
    });

    // バックアップ完了をログ出力
    backupPromise
      .then(result => {
        console.log(`✅ 手動バックアップ完了: ${result.id} (${result.status})`);
      })
      .catch(error => {
        console.error(`❌ 手動バックアップ失敗:`, error);
      });

  } catch (error) {
    console.error('手動バックアップAPIエラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップ履歴を取得
 */
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const limit = parseInt(req.query.limit as string) || 20;
    const backupService = getBackupService(db);
    
    const history = await backupService.getBackupHistory(limit);
    
    res.json({
      history,
      totalItems: history.length,
    });

  } catch (error) {
    console.error('バックアップ履歴取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップ統計情報を取得
 */
router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const backupService = getBackupService(db);
    const stats = await backupService.getBackupStats();
    
    res.json({
      ...stats,
      totalSizeMB: Math.round(stats.totalSize / 1024 / 1024 * 100) / 100,
      lastBackupAgo: stats.lastBackup 
        ? Math.round((Date.now() - stats.lastBackup.timestamp.getTime()) / 1000 / 60) // 分
        : null,
    });

  } catch (error) {
    console.error('バックアップ統計取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップスケジュール状態を取得
 */
router.get('/schedule/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    // 環境変数からスケジュール設定を取得
    const scheduleConfig = {
      daily: process.env.BACKUP_DAILY_CRON || '0 2 * * *',
      weekly: process.env.BACKUP_WEEKLY_CRON || '0 3 * * 0',
      monthly: process.env.BACKUP_MONTHLY_CRON || '0 4 1 * *',
    };

    const retentionConfig = {
      dailyBackups: parseInt(process.env.BACKUP_DAILY_RETENTION || '7'),
      weeklyBackups: parseInt(process.env.BACKUP_WEEKLY_RETENTION || '4'),
      monthlyBackups: parseInt(process.env.BACKUP_MONTHLY_RETENTION || '12'),
    };

    const targetConfig = {
      database: process.env.BACKUP_DATABASE !== 'false',
      userFiles: process.env.BACKUP_USER_FILES !== 'false',
      systemFiles: process.env.BACKUP_SYSTEM_FILES !== 'false',
      logs: process.env.BACKUP_LOGS !== 'false',
    };

    res.json({
      enabled: true, // バックアップサービスが初期化されている場合
      schedule: scheduleConfig,
      retention: retentionConfig,
      targets: targetConfig,
      timezone: process.env.BACKUP_TIMEZONE || 'Asia/Tokyo',
    });

  } catch (error) {
    console.error('バックアップスケジュール状態取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップスケジュールを開始
 */
router.post('/schedule/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const backupService = getBackupService(db);
    backupService.startScheduledBackups();
    
    res.json({
      message: 'Backup schedules started',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('バックアップスケジュール開始エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップスケジュールを停止
 */
router.post('/schedule/stop', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const backupService = getBackupService(db);
    backupService.stopScheduledBackups();
    
    res.json({
      message: 'Backup schedules stopped',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('バックアップスケジュール停止エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 特定のバックアップ詳細を取得
 */
router.get('/details/:backupId', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const { backupId } = req.params;
    const backupService = getBackupService(db);
    
    const history = await backupService.getBackupHistory(100);
    const backup = history.find(b => b.id === backupId);
    
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.json(backup);

  } catch (error) {
    console.error('バックアップ詳細取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * バックアップ設定のテスト
 */
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const backupService = getBackupService(db);
    
    // テスト用の小さなバックアップを実行
    const testResult = await backupService.performManualBackup('daily', {
      database: true,
      userFiles: false,
      systemFiles: false,
      logs: false,
    });

    res.json({
      message: 'Backup test completed',
      result: testResult,
      success: testResult.status === 'success',
    });

  } catch (error) {
    console.error('バックアップテストエラー:', error);
    res.status(500).json({ 
      error: 'Backup test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * ヘルスチェック
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const backupService = getBackupService(db);
    const stats = await backupService.getBackupStats();
    
    // 過去24時間以内にバックアップがあるかチェック
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    const recentBackup = stats.lastBackup && stats.lastBackup.timestamp.getTime() > last24Hours;
    
    const status = recentBackup && stats.successRate > 80 ? 'healthy' : 'degraded';
    
    res.status(status === 'healthy' ? 200 : 206).json({
      status,
      lastBackup: stats.lastBackup,
      successRate: stats.successRate,
      totalBackups: stats.totalBackups,
      checks: {
        recentBackup,
        goodSuccessRate: stats.successRate > 80,
      },
    });

  } catch (error) {
    console.error('バックアップヘルスチェックエラー:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

export { router as backupRouter };