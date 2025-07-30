/**
 * インポートAPIエンドポイント
 * データインポート機能のAPI
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import { ImportService } from '../services/importService';
import { authenticateToken } from '../middleware/auth';
import path from 'path';

const router = Router();
let db: Pool;
let importService: ImportService;

/**
 * データベース接続を設定
 */
export function setDatabase(database: Pool) {
  db = database;
  importService = new ImportService(db);
}

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'temp', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.json', '.csv', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

/**
 * ファイル検証
 */
router.post('/validate', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { source } = req.body;
    
    if (!['x-bookmarker', 'twitter', 'chrome', 'firefox', 'csv', 'json'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    const result = await importService.validateImportFile(req.file.path, source);
    
    res.json(result);
  } catch (error) {
    console.error('ファイル検証エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * インポート開始
 */
router.post('/', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = {
      source: req.body.source,
      duplicateStrategy: req.body.duplicateStrategy || 'skip',
      defaultCategory: req.body.defaultCategory,
      validate: req.body.validate === 'true',
      dryRun: req.body.dryRun === 'true',
    };

    // オプションの検証
    if (!['x-bookmarker', 'twitter', 'chrome', 'firefox', 'csv', 'json'].includes(options.source)) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    if (!['skip', 'update', 'create_duplicate'].includes(options.duplicateStrategy)) {
      return res.status(400).json({ error: 'Invalid duplicate strategy' });
    }

    const result = await importService.startImport(userId, req.file.path, options);
    
    res.json(result);
  } catch (error) {
    console.error('インポート開始エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * インポート状況確認
 */
router.get('/status/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const status = await importService.getImportStatus(jobId);
    
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(status);
  } catch (error) {
    console.error('インポート状況取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * インポート履歴取得
 */
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const limit = parseInt(req.query.limit as string) || 10;
    
    const history = await importService.getImportHistory(userId, limit);
    
    res.json({ history });
  } catch (error) {
    console.error('インポート履歴取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as importRouter };