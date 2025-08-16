#!/usr/bin/env tsx

/**
 * 環境セットアップスクリプト
 * 
 * 使用方法:
 * npm run setup:env     - 環境セットアップ実行
 * npm run setup:check   - 環境検証のみ実行
 * npm run setup:full    - フルセットアップ（セットアップ + 検証）
 */

import { environmentSetup } from '../utils/environmentSetup';

async function main() {
  const command = process.argv[2] || 'help';

  try {
    switch (command) {
      case 'env':
      case 'setup':
        await environmentSetup.setup();
        break;

      case 'check':
      case 'validate':
        await environmentSetup.validate();
        break;

      case 'full':
        await environmentSetup.fullSetup();
        break;

      case 'help':
      case '--help':
      case '-h':
      default:
        console.log(`
🚀 X-Bookmarker 環境セットアップスクリプト

使用方法:
  npm run setup:env     環境セットアップ実行
  npm run setup:check   環境検証のみ実行  
  npm run setup:full    フルセットアップ（推奨）

コマンド:
  env, setup      .envファイル作成、JWT秘密鍵生成等
  check, validate 環境設定の検証
  full            セットアップ + 検証の実行
  help            このヘルプを表示

例:
  npm run setup:full  # 初回セットアップ時（推奨）
  npm run setup:check # 環境確認時
        `);
        break;
    }
  } catch (error) {
    console.error('❌ スクリプト実行エラー:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみ実行
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 予期しないエラー:', error);
    process.exit(1);
  });
}

export { main };