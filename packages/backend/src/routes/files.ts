/**
 * ファイルダウンロード・アクセスAPIエンドポイント
 * ストレージサービスからのファイル配信
 */

import { Router, Request, Response } from 'express';
import { getStorageService } from '../services/storageService';
import { authenticateToken } from '../middleware/auth';
import path from 'path';

const router = Router();
const storage = getStorageService();

/**
 * ファイルダウンロード（認証必要）
 */
router.get('/download/:userId/:filename', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId, filename } = req.params;
    
    // ユーザー認証チェック（自分のファイルのみアクセス可能）
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // エクスポートファイルのキーを構築
    const storageKey = `exports/${userId}/${filename}`;
    
    // ファイル情報を取得
    const fileInfo = await storage.getFileInfo(storageKey);
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 署名付きURLを生成してリダイレクト
    const signedUrl = await storage.generateSignedUrl(storageKey, 3600); // 1時間有効
    
    // ダイレクトアクセスかリダイレクトかを選択
    if (req.query.redirect === 'false') {
      res.json({
        url: signedUrl,
        filename: filename,
        size: fileInfo.size,
        contentType: fileInfo.contentType,
      });
    } else {
      res.redirect(signedUrl);
    }

  } catch (error) {
    console.error('ファイルダウンロードエラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ファイル情報取得
 */
router.get('/info/:userId/:filename', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId, filename } = req.params;
    
    // ユーザー認証チェック
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const storageKey = `exports/${userId}/${filename}`;
    const fileInfo = await storage.getFileInfo(storageKey);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      filename: filename,
      size: fileInfo.size,
      contentType: fileInfo.contentType,
      url: fileInfo.url,
      metadata: fileInfo.metadata,
    });

  } catch (error) {
    console.error('ファイル情報取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ユーザーのエクスポートファイル一覧
 */
router.get('/list/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // ユーザー認証チェック
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const files = await storage.listFiles(`exports/${userId}/`);
    
    const fileList = files.map(file => ({
      filename: path.basename(file.key),
      size: file.size,
      contentType: file.contentType,
      downloadUrl: `/api/files/download/${userId}/${path.basename(file.key)}`,
      metadata: file.metadata,
    }));

    res.json({
      files: fileList,
      totalFiles: fileList.length,
      totalSize: fileList.reduce((sum, file) => sum + file.size, 0),
    });

  } catch (error) {
    console.error('ファイル一覧取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ファイル削除
 */
router.delete('/delete/:userId/:filename', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId, filename } = req.params;
    
    // ユーザー認証チェック
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const storageKey = `exports/${userId}/${filename}`;
    
    // ファイルが存在するかチェック
    const fileInfo = await storage.getFileInfo(storageKey);
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    // ファイル削除
    await storage.deleteFile(storageKey);
    
    res.json({ 
      message: 'File deleted successfully',
      filename: filename 
    });

  } catch (error) {
    console.error('ファイル削除エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ストレージ統計情報（管理者用）
 */
router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const stats = await storage.getStorageStats();
    
    res.json({
      ...stats,
      totalSizeMB: Math.round(stats.totalSize / 1024 / 1024 * 100) / 100,
    });

  } catch (error) {
    console.error('ストレージ統計取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 古いファイルのクリーンアップ（管理者用・手動実行）
 */
router.post('/cleanup', authenticateToken, async (req: Request, res: Response) => {
  try {
    // 管理者権限チェック（必要に応じて実装）
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const { olderThanDays = 7 } = req.body;
    
    const deletedCount = await storage.cleanupOldFiles(olderThanDays);
    
    res.json({
      message: 'Cleanup completed',
      deletedFiles: deletedCount,
      olderThanDays,
    });

  } catch (error) {
    console.error('ファイルクリーンアップエラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as filesRouter };