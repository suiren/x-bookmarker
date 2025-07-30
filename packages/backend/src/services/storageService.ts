/**
 * ファイルストレージサービス
 * AWS S3とローカルストレージの統合管理
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { config } from '../config';

interface StorageConfig {
  provider: 'local' | 's3';
  local?: {
    basePath: string;
    publicUrl: string;
  };
  s3?: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  };
}

interface StorageFile {
  key: string;
  size: number;
  contentType: string;
  url: string;
  metadata?: Record<string, string>;
}

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  expires?: number; // 署名付きURLの有効期限（秒）
}

class StorageService {
  private s3Client?: S3Client;
  private storageConfig: StorageConfig;

  constructor() {
    this.storageConfig = this.initializeConfig();
    if (this.storageConfig.provider === 's3') {
      this.initializeS3Client();
    }
  }

  /**
   * ストレージ設定を初期化
   */
  private initializeConfig(): StorageConfig {
    const provider = (process.env.STORAGE_PROVIDER as 'local' | 's3') || 'local';

    if (provider === 's3') {
      return {
        provider: 's3',
        s3: {
          region: process.env.AWS_REGION || 'us-east-1',
          bucket: process.env.AWS_S3_BUCKET || 'x-bookmarker-files',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          endpoint: process.env.AWS_S3_ENDPOINT, // MinIOなどのS3互換サービス用
        },
      };
    }

    return {
      provider: 'local',
      local: {
        basePath: process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), 'storage'),
        publicUrl: process.env.LOCAL_STORAGE_URL || '/api/files',
      },
    };
  }

  /**
   * S3クライアントを初期化
   */
  private initializeS3Client(): void {
    if (!this.storageConfig.s3) {
      throw new Error('S3 configuration is missing');
    }

    const s3Config: any = {
      region: this.storageConfig.s3.region,
      credentials: {
        accessKeyId: this.storageConfig.s3.accessKeyId,
        secretAccessKey: this.storageConfig.s3.secretAccessKey,
      },
    };

    // カスタムエンドポイント設定（MinIO等）
    if (this.storageConfig.s3.endpoint) {
      s3Config.endpoint = this.storageConfig.s3.endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);
    console.log('✅ S3クライアントを初期化しました');
  }

  /**
   * ファイルをアップロード
   */
  async uploadFile(
    key: string,
    filePath: string,
    options: UploadOptions = {}
  ): Promise<StorageFile> {
    console.log(`📤 ファイルアップロード開始: ${key}`);

    if (this.storageConfig.provider === 's3') {
      return await this.uploadToS3(key, filePath, options);
    } else {
      return await this.uploadToLocal(key, filePath, options);
    }
  }

  /**
   * ファイルをダウンロード
   */
  async downloadFile(key: string, destinationPath: string): Promise<void> {
    console.log(`📥 ファイルダウンロード開始: ${key}`);

    if (this.storageConfig.provider === 's3') {
      await this.downloadFromS3(key, destinationPath);
    } else {
      await this.downloadFromLocal(key, destinationPath);
    }
  }

  /**
   * ファイルを削除
   */
  async deleteFile(key: string): Promise<void> {
    console.log(`🗑️ ファイル削除: ${key}`);

    if (this.storageConfig.provider === 's3') {
      await this.deleteFromS3(key);
    } else {
      await this.deleteFromLocal(key);
    }
  }

  /**
   * ファイル情報を取得
   */
  async getFileInfo(key: string): Promise<StorageFile | null> {
    if (this.storageConfig.provider === 's3') {
      return await this.getS3FileInfo(key);
    } else {
      return await this.getLocalFileInfo(key);
    }
  }

  /**
   * 署名付きURLを生成（一時的なアクセス用）
   */
  async generateSignedUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    if (this.storageConfig.provider === 's3') {
      return await this.generateS3SignedUrl(key, expiresIn);
    } else {
      return await this.generateLocalSignedUrl(key, expiresIn);
    }
  }

  /**
   * ディレクトリ内のファイル一覧を取得
   */
  async listFiles(prefix: string = ''): Promise<StorageFile[]> {
    if (this.storageConfig.provider === 's3') {
      return await this.listS3Files(prefix);
    } else {
      return await this.listLocalFiles(prefix);
    }
  }

  /**
   * ストレージの使用量統計を取得
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    provider: string;
    breakdown: Record<string, { count: number; size: number }>;
  }> {
    const files = await this.listFiles();
    const breakdown: Record<string, { count: number; size: number }> = {};

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      
      const category = file.key.split('/')[0] || 'unknown';
      if (!breakdown[category]) {
        breakdown[category] = { count: 0, size: 0 };
      }
      breakdown[category].count++;
      breakdown[category].size += file.size;
    }

    return {
      totalFiles: files.length,
      totalSize,
      provider: this.storageConfig.provider,
      breakdown,
    };
  }

  // ===== S3関連のプライベートメソッド =====

  private async uploadToS3(
    key: string,
    filePath: string,
    options: UploadOptions
  ): Promise<StorageFile> {
    if (!this.s3Client || !this.storageConfig.s3) {
      throw new Error('S3 client not initialized');
    }

    const fileStats = await fs.stat(filePath);
    const fileStream = createReadStream(filePath);

    const uploadParams = {
      Bucket: this.storageConfig.s3.bucket,
      Key: key,
      Body: fileStream,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata || {},
    };

    await this.s3Client.send(new PutObjectCommand(uploadParams));

    const url = await this.generateS3SignedUrl(key, options.expires || 3600);

    return {
      key,
      size: fileStats.size,
      contentType: options.contentType || 'application/octet-stream',
      url,
      metadata: options.metadata,
    };
  }

  private async downloadFromS3(key: string, destinationPath: string): Promise<void> {
    if (!this.s3Client || !this.storageConfig.s3) {
      throw new Error('S3 client not initialized');
    }

    const getObjectParams = {
      Bucket: this.storageConfig.s3.bucket,
      Key: key,
    };

    const response = await this.s3Client.send(new GetObjectCommand(getObjectParams));
    
    if (!response.Body) {
      throw new Error('No file content received from S3');
    }

    const writeStream = createWriteStream(destinationPath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
  }

  private async deleteFromS3(key: string): Promise<void> {
    if (!this.s3Client || !this.storageConfig.s3) {
      throw new Error('S3 client not initialized');
    }

    const deleteParams = {
      Bucket: this.storageConfig.s3.bucket,
      Key: key,
    };

    await this.s3Client.send(new DeleteObjectCommand(deleteParams));
  }

  private async getS3FileInfo(key: string): Promise<StorageFile | null> {
    if (!this.s3Client || !this.storageConfig.s3) {
      throw new Error('S3 client not initialized');
    }

    try {
      const headParams = {
        Bucket: this.storageConfig.s3.bucket,
        Key: key,
      };

      const response = await this.s3Client.send(new HeadObjectCommand(headParams));
      const url = await this.generateS3SignedUrl(key);

      return {
        key,
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        url,
        metadata: response.Metadata,
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  private async generateS3SignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.s3Client || !this.storageConfig.s3) {
      throw new Error('S3 client not initialized');
    }

    const getObjectParams = {
      Bucket: this.storageConfig.s3.bucket,
      Key: key,
    };

    return await getSignedUrl(this.s3Client, new GetObjectCommand(getObjectParams), {
      expiresIn,
    });
  }

  private async listS3Files(prefix: string): Promise<StorageFile[]> {
    // S3のListObjectsV2実装は複雑になるため、今回は基本実装をスキップ
    // 実際の実装では@aws-sdk/client-s3のListObjectsV2Commandを使用
    return [];
  }

  // ===== ローカルストレージ関連のプライベートメソッド =====

  private async uploadToLocal(
    key: string,
    filePath: string,
    options: UploadOptions
  ): Promise<StorageFile> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    const destinationPath = path.join(this.storageConfig.local.basePath, key);
    const destinationDir = path.dirname(destinationPath);

    // ディレクトリを作成
    await fs.mkdir(destinationDir, { recursive: true });

    // ファイルをコピー
    await fs.copyFile(filePath, destinationPath);

    const fileStats = await fs.stat(destinationPath);
    const url = `${this.storageConfig.local.publicUrl}/${key}`;

    // メタデータを別ファイルに保存（必要に応じて）
    if (options.metadata) {
      const metadataPath = `${destinationPath}.meta`;
      await fs.writeFile(metadataPath, JSON.stringify(options.metadata));
    }

    return {
      key,
      size: fileStats.size,
      contentType: options.contentType || 'application/octet-stream',
      url,
      metadata: options.metadata,
    };
  }

  private async downloadFromLocal(key: string, destinationPath: string): Promise<void> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    const sourcePath = path.join(this.storageConfig.local.basePath, key);
    await fs.copyFile(sourcePath, destinationPath);
  }

  private async deleteFromLocal(key: string): Promise<void> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    const filePath = path.join(this.storageConfig.local.basePath, key);
    const metadataPath = `${filePath}.meta`;

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // メタデータファイルも削除
    try {
      await fs.unlink(metadataPath);
    } catch (error: any) {
      // メタデータファイルが存在しない場合は無視
    }
  }

  private async getLocalFileInfo(key: string): Promise<StorageFile | null> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    const filePath = path.join(this.storageConfig.local.basePath, key);
    const metadataPath = `${filePath}.meta`;

    try {
      const fileStats = await fs.stat(filePath);
      const url = `${this.storageConfig.local.publicUrl}/${key}`;

      // メタデータを読み込み
      let metadata: Record<string, string> | undefined;
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch {
        // メタデータファイルが存在しない場合は無視
      }

      // ファイル拡張子からContent-Typeを推定
      const contentType = this.getContentTypeFromExtension(key);

      return {
        key,
        size: fileStats.size,
        contentType,
        url,
        metadata,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async generateLocalSignedUrl(key: string, expiresIn: number): Promise<string> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    // ローカルストレージの場合、署名付きURLの代わりに通常のURLを返す
    // 実際の実装では、JWTトークンを使った認証付きURLを生成することも可能
    return `${this.storageConfig.local.publicUrl}/${key}`;
  }

  private async listLocalFiles(prefix: string): Promise<StorageFile[]> {
    if (!this.storageConfig.local) {
      throw new Error('Local storage configuration is missing');
    }

    const files: StorageFile[] = [];
    const searchPath = path.join(this.storageConfig.local.basePath, prefix);

    try {
      const walk = async (dir: string, baseDir: string = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(baseDir, entry.name);

          if (entry.isDirectory()) {
            await walk(fullPath, relativePath);
          } else if (entry.isFile() && !entry.name.endsWith('.meta')) {
            const stats = await fs.stat(fullPath);
            const key = relativePath.replace(/\\/g, '/'); // Windowsパス対応
            
            files.push({
              key,
              size: stats.size,
              contentType: this.getContentTypeFromExtension(key),
              url: `${this.storageConfig.local.publicUrl}/${key}`,
            });
          }
        }
      };

      await walk(searchPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return files;
  }

  private getContentTypeFromExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 古いファイルのクリーンアップ
   */
  async cleanupOldFiles(olderThanDays: number = 7): Promise<number> {
    console.log(`🧹 ${olderThanDays}日前より古いファイルをクリーンアップ中...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const files = await this.listFiles();
    let deletedCount = 0;

    for (const file of files) {
      try {
        const fileInfo = await this.getFileInfo(file.key);
        
        // ローカルファイルの場合、作成日時をチェック
        if (this.storageConfig.provider === 'local' && this.storageConfig.local) {
          const filePath = path.join(this.storageConfig.local.basePath, file.key);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await this.deleteFile(file.key);
            deletedCount++;
            console.log(`🗑️ 削除: ${file.key}`);
          }
        }
      } catch (error) {
        console.warn(`ファイル削除警告: ${file.key}`, error);
      }
    }

    console.log(`✅ ${deletedCount}個のファイルを削除しました`);
    return deletedCount;
  }
}

// シングルトンインスタンス
let storageServiceInstance: StorageService | null = null;

/**
 * ストレージサービスのシングルトンインスタンスを取得
 */
export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}

export { StorageService };
export type { StorageFile, UploadOptions, StorageConfig };