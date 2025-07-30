/**
 * エクスポートAPIエンドポイント
 * データエクスポート機能のAPI
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ExportService } from '../services/exportService';
import { authenticateToken } from '../middleware/auth';

const router = Router();
let db: Pool;
let exportService: ExportService;

/**
 * データベース接続を設定
 */
export function setDatabase(database: Pool) {
  db = database;
  exportService = new ExportService(db);
}

/**
 * エクスポート開始
 */
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const options = req.body;
    
    // オプションの検証
    if (!['json', 'csv', 'zip'].includes(options.format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    const result = await exportService.startExport(userId, options);
    
    res.json(result);
  } catch (error) {
    console.error('エクスポート開始エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * エクスポート状況確認
 */
router.get('/status/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const status = await exportService.getExportStatus(jobId);
    
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(status);
  } catch (error) {
    console.error('エクスポート状況取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * エクスポート履歴取得
 */
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const limit = parseInt(req.query.limit as string) || 10;
    
    const history = await exportService.getExportHistory(userId, limit);
    
    res.json({ history });
  } catch (error) {
    console.error('エクスポート履歴取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as exportRouter };