/**
 * 必要なディレクトリを作成するユーティリティ
 */

import fs from 'fs/promises';
import path from 'path';

export async function createRequiredDirectories(): Promise<void> {
  const directories = [
    'temp',
    'temp/uploads',
    'temp/backups',
    'temp/imports',
    'storage',
    'exports',
    'logs'
  ];

  for (const dir of directories) {
    const fullPath = path.join(process.cwd(), dir);
    
    try {
      await fs.access(fullPath);
    } catch {
      // ディレクトリが存在しない場合は作成
      try {
        await fs.mkdir(fullPath, { recursive: true });
        console.log(`✅ Created directory: ${fullPath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to create directory ${fullPath}:`, error);
      }
    }
  }
}