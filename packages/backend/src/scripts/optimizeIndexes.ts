#!/usr/bin/env node
/**
 * データベースインデックス最適化スクリプト
 * パフォーマンス分析に基づいてインデックスを作成・管理する
 */

import { getPool } from '../database/connection';

interface IndexDefinition {
  name: string;
  table: string;
  definition: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedSize: string;
}

class IndexOptimizer {
  private db = getPool();

  private readonly recommendedIndexes: IndexDefinition[] = [
    {
      name: 'idx_bookmarks_user_bookmarked',
      table: 'bookmarks',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_bookmarked ON bookmarks(user_id, bookmarked_at DESC)',
      description: 'ユーザー別ブックマーク一覧取得の高速化（最も重要）',
      impact: 'HIGH',
      estimatedSize: '~50MB (10万件の場合)'
    },
    {
      name: 'idx_bookmarks_user_archived',
      table: 'bookmarks',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_archived ON bookmarks(user_id, is_archived)',
      description: 'アーカイブ状態での絞り込み高速化',
      impact: 'HIGH',
      estimatedSize: '~30MB (10万件の場合)'
    },
    {
      name: 'idx_bookmarks_search_vector',
      table: 'bookmarks',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_search_vector ON bookmarks USING gin(search_vector)',
      description: '全文検索の高速化',
      impact: 'HIGH',
      estimatedSize: '~100MB (10万件の場合)'
    },
    {
      name: 'idx_bookmarks_tags',
      table: 'bookmarks',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_tags ON bookmarks USING gin(tags)',
      description: 'タグ検索の高速化',
      impact: 'HIGH',
      estimatedSize: '~40MB (10万件の場合)'
    },
    {
      name: 'idx_categories_user',
      table: 'categories',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_user ON categories(user_id)',
      description: 'ユーザー別カテゴリ取得の高速化',
      impact: 'MEDIUM',
      estimatedSize: '~5MB'
    },
    {
      name: 'idx_bookmarks_category_user',
      table: 'bookmarks',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_category_user ON bookmarks(category_id, user_id) WHERE is_archived = FALSE',
      description: 'カテゴリ別集計の高速化',
      impact: 'MEDIUM',
      estimatedSize: '~40MB (10万件の場合)'
    },
    {
      name: 'idx_search_history_user_created',
      table: 'search_history',
      definition: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_history_user_created ON search_history(user_id, created_at DESC)',
      description: '検索履歴取得の高速化',
      impact: 'LOW',
      estimatedSize: '~10MB'
    }
  ];

  /**
   * 現在のインデックス状態を確認
   */
  async checkCurrentIndexes(): Promise<any[]> {
    console.log('📊 現在のインデックス状態を確認中...');
    
    const result = await this.db.query(`
      SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef,
          pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes 
      WHERE schemaname = 'public'
          AND tablename IN ('bookmarks', 'categories', 'search_history')
      ORDER BY tablename, indexname
    `);

    console.log(`✅ ${result.rows.length}個のインデックスが見つかりました`);
    
    return result.rows;
  }

  /**
   * インデックス使用統計を取得
   */
  async getIndexStats(): Promise<any[]> {
    console.log('📈 インデックス使用統計を取得中...');
    
    const result = await this.db.query(`
      SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
          AND tablename IN ('bookmarks', 'categories', 'search_history')
      ORDER BY idx_scan DESC, tablename, indexname
    `);

    return result.rows;
  }

  /**
   * 未使用インデックスを検出
   */
  async findUnusedIndexes(): Promise<any[]> {
    console.log('🔍 未使用インデックスを検出中...');
    
    const result = await this.db.query(`
      SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
          AND tablename IN ('bookmarks', 'categories', 'search_history')
          AND idx_scan = 0
          AND indexname NOT LIKE '%_pkey'  -- プライマリキーは除外
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `);

    if (result.rows.length > 0) {
      console.log(`⚠️  ${result.rows.length}個の未使用インデックスが見つかりました`);
      result.rows.forEach(row => {
        console.log(`   - ${row.tablename}.${row.indexname} (${row.size})`);
      });
    } else {
      console.log('✅ 未使用インデックスはありません');
    }

    return result.rows;
  }

  /**
   * テーブルサイズとインデックスサイズを確認
   */
  async getTableSizes(): Promise<any[]> {
    console.log('💾 テーブルサイズを確認中...');
    
    const result = await this.db.query(`
      SELECT 
          tablename,
          pg_size_pretty(pg_total_relation_size(tablename::regclass)) as total_size,
          pg_size_pretty(pg_relation_size(tablename::regclass)) as table_size,
          pg_size_pretty(pg_total_relation_size(tablename::regclass) - pg_relation_size(tablename::regclass)) as indexes_size,
          pg_total_relation_size(tablename::regclass) as total_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
          AND tablename IN ('bookmarks', 'categories', 'search_history')
      ORDER BY total_bytes DESC
    `);

    result.rows.forEach(row => {
      console.log(`   ${row.tablename}: Total ${row.total_size} (Table: ${row.table_size}, Indexes: ${row.indexes_size})`);
    });

    return result.rows;
  }

  /**
   * 推奨インデックスの状態をチェック
   */
  async checkRecommendedIndexes(): Promise<{
    existing: string[];
    missing: IndexDefinition[];
  }> {
    console.log('🎯 推奨インデックスの状態をチェック中...');
    
    const existingIndexes = await this.db.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
          AND indexname = ANY($1)
    `, [this.recommendedIndexes.map(idx => idx.name)]);

    const existingNames = existingIndexes.rows.map(row => row.indexname);
    const missing = this.recommendedIndexes.filter(idx => !existingNames.includes(idx.name));

    console.log(`✅ 推奨インデックス: ${existingNames.length}/${this.recommendedIndexes.length}個が作成済み`);
    
    if (missing.length > 0) {
      console.log(`📝 未作成の推奨インデックス:`);
      missing.forEach(idx => {
        console.log(`   - ${idx.name} (${idx.impact} impact): ${idx.description}`);
      });
    }

    return { existing: existingNames, missing };
  }

  /**
   * インデックスを作成
   */
  async createIndex(indexDef: IndexDefinition): Promise<boolean> {
    console.log(`🔨 インデックス作成中: ${indexDef.name}`);
    console.log(`   説明: ${indexDef.description}`);
    console.log(`   推定サイズ: ${indexDef.estimatedSize}`);
    
    try {
      const startTime = Date.now();
      await this.db.query(indexDef.definition);
      const duration = Date.now() - startTime;
      
      console.log(`✅ インデックス作成完了: ${indexDef.name} (${duration}ms)`);
      return true;
    } catch (error) {
      console.error(`❌ インデックス作成失敗: ${indexDef.name}`);
      console.error(`   エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * 高優先度インデックスのみを作成
   */
  async createHighPriorityIndexes(): Promise<void> {
    console.log('🚀 高優先度インデックスの作成を開始...');
    
    const { missing } = await this.checkRecommendedIndexes();
    const highPriority = missing.filter(idx => idx.impact === 'HIGH');

    if (highPriority.length === 0) {
      console.log('✅ 高優先度インデックスはすべて作成済みです');
      return;
    }

    console.log(`📋 ${highPriority.length}個の高優先度インデックスを作成します...`);
    
    for (const indexDef of highPriority) {
      await this.createIndex(indexDef);
    }

    console.log('✨ 高優先度インデックスの作成が完了しました');
  }

  /**
   * すべての推奨インデックスを作成
   */
  async createAllRecommendedIndexes(): Promise<void> {
    console.log('🚀 すべての推奨インデックスの作成を開始...');
    
    const { missing } = await this.checkRecommendedIndexes();

    if (missing.length === 0) {
      console.log('✅ 推奨インデックスはすべて作成済みです');
      return;
    }

    console.log(`📋 ${missing.length}個のインデックスを作成します...`);
    
    // 優先度順に作成
    const ordered = missing.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.impact] - priorityOrder[b.impact];
    });

    for (const indexDef of ordered) {
      await this.createIndex(indexDef);
    }

    console.log('✨ すべての推奨インデックスの作成が完了しました');
  }

  /**
   * 包括的なインデックス分析レポートを生成
   */
  async generateOptimizationReport(): Promise<string> {
    console.log('📊 インデックス最適化レポートを生成中...');
    
    const [currentIndexes, indexStats, unusedIndexes, tableSizes, recommendedStatus] = await Promise.all([
      this.checkCurrentIndexes(),
      this.getIndexStats(),
      this.findUnusedIndexes(),
      this.getTableSizes(),
      this.checkRecommendedIndexes()
    ]);

    const lines: string[] = [];

    lines.push('# データベースインデックス最適化レポート');
    lines.push('');
    lines.push(`**生成日時**: ${new Date().toISOString()}`);
    lines.push('');

    // 現在の状況サマリー
    lines.push('## 📊 現在の状況');
    lines.push('');
    lines.push(`- **既存インデックス数**: ${currentIndexes.filter(idx => !idx.indexname.includes('_pkey')).length}個`);
    lines.push(`- **推奨インデックス実装率**: ${recommendedStatus.existing.length}/${this.recommendedIndexes.length}個 (${Math.round(recommendedStatus.existing.length / this.recommendedIndexes.length * 100)}%)`);
    lines.push(`- **未使用インデックス**: ${unusedIndexes.length}個`);
    lines.push('');

    // テーブルサイズ情報
    lines.push('## 💾 テーブルサイズ');
    lines.push('');
    lines.push('| テーブル | 総サイズ | テーブル | インデックス |');
    lines.push('|----------|----------|----------|-------------|');
    tableSizes.forEach(table => {
      lines.push(`| ${table.tablename} | ${table.total_size} | ${table.table_size} | ${table.indexes_size} |`);
    });
    lines.push('');

    // 推奨インデックスの状況
    if (recommendedStatus.missing.length > 0) {
      lines.push('## 🎯 未実装の推奨インデックス');
      lines.push('');
      recommendedStatus.missing.forEach(idx => {
        const impactIcon = idx.impact === 'HIGH' ? '🔥' : idx.impact === 'MEDIUM' ? '⚡' : '💡';
        lines.push(`### ${impactIcon} ${idx.name}`);
        lines.push(`**影響度**: ${idx.impact}`);
        lines.push(`**説明**: ${idx.description}`);
        lines.push(`**推定サイズ**: ${idx.estimatedSize}`);
        lines.push('```sql');
        lines.push(idx.definition + ';');
        lines.push('```');
        lines.push('');
      });
    }

    // インデックス使用統計
    if (indexStats.length > 0) {
      lines.push('## 📈 インデックス使用統計 (TOP 10)');
      lines.push('');
      lines.push('| インデックス名 | スキャン回数 | タプル読み取り | タプル取得 |');
      lines.push('|---------------|-------------|---------------|-----------|');
      indexStats.slice(0, 10).forEach(stat => {
        lines.push(`| ${stat.indexname} | ${stat.idx_scan} | ${stat.idx_tup_read} | ${stat.idx_tup_fetch} |`);
      });
      lines.push('');
    }

    // 未使用インデックス
    if (unusedIndexes.length > 0) {
      lines.push('## ⚠️ 未使用インデックス');
      lines.push('');
      lines.push('以下のインデックスは一度もスキャンされていません。削除を検討してください：');
      lines.push('');
      unusedIndexes.forEach(idx => {
        lines.push(`- **${idx.tablename}.${idx.indexname}** (${idx.size})`);
        lines.push(`  \`\`\`sql`);
        lines.push(`  DROP INDEX IF EXISTS ${idx.indexname};`);
        lines.push(`  \`\`\``);
        lines.push('');
      });
    }

    // 実行計画
    lines.push('## 🛠️ 実行計画');
    lines.push('');
    if (recommendedStatus.missing.length > 0) {
      const highPriority = recommendedStatus.missing.filter(idx => idx.impact === 'HIGH');
      const mediumPriority = recommendedStatus.missing.filter(idx => idx.impact === 'MEDIUM');
      const lowPriority = recommendedStatus.missing.filter(idx => idx.impact === 'LOW');

      if (highPriority.length > 0) {
        lines.push('### Phase 1: 高優先度インデックス（即座に実行推奨）');
        highPriority.forEach(idx => {
          lines.push(`- ${idx.name}: ${idx.description}`);
        });
        lines.push('');
      }

      if (mediumPriority.length > 0) {
        lines.push('### Phase 2: 中優先度インデックス');
        mediumPriority.forEach(idx => {
          lines.push(`- ${idx.name}: ${idx.description}`);
        });
        lines.push('');
      }

      if (lowPriority.length > 0) {
        lines.push('### Phase 3: 低優先度インデックス');
        lowPriority.forEach(idx => {
          lines.push(`- ${idx.name}: ${idx.description}`);
        });
        lines.push('');
      }
    } else {
      lines.push('✅ すべての推奨インデックスが実装済みです。');
    }

    // 一括実行SQL
    if (recommendedStatus.missing.length > 0) {
      lines.push('## 📜 一括実行SQL');
      lines.push('');
      lines.push('```sql');
      lines.push('-- データベースインデックス最適化');
      lines.push(`-- 生成日時: ${new Date().toISOString()}`);
      lines.push('');
      recommendedStatus.missing.forEach(idx => {
        lines.push(`-- ${idx.description} (${idx.impact})`);
        lines.push(idx.definition + ';');
        lines.push('');
      });
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.db.end();
  }
}

async function main() {
  console.log('🔧 データベースインデックス最適化を開始します...');
  
  const optimizer = new IndexOptimizer();
  
  try {
    // 現在の状況を確認
    await optimizer.checkCurrentIndexes();
    await optimizer.getTableSizes();
    await optimizer.findUnusedIndexes();
    
    // 推奨インデックスの状況をチェック
    const { missing } = await optimizer.checkRecommendedIndexes();
    
    if (missing.length > 0) {
      console.log('\n🤔 インデックス作成オプション:');
      console.log('1. 高優先度のみ作成 (推奨)');
      console.log('2. すべての推奨インデックス作成');
      console.log('3. レポートのみ生成');
      
      // 本番環境では高優先度インデックスのみを作成
      console.log('\n🚀 高優先度インデックスを作成します...');
      await optimizer.createHighPriorityIndexes();
    }
    
    // レポート生成
    const report = await optimizer.generateOptimizationReport();
    
    // レポート保存
    const fs = await import('fs');
    const path = await import('path');
    
    const reportsDir = path.default.join(process.cwd(), 'reports');
    if (!fs.default.existsSync(reportsDir)) {
      fs.default.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.default.join(reportsDir, `index-optimization-${timestamp}.md`);
    
    fs.default.writeFileSync(reportPath, report);
    console.log(`\n✅ 最適化レポートを保存しました: ${reportPath}`);
    
    console.log('\n✨ インデックス最適化が完了しました');
    
  } catch (error) {
    console.error('❌ 最適化中にエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await optimizer.cleanup();
  }
}

// メイン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ 実行中にエラーが発生しました:', error);
    process.exit(1);
  });
}

export { IndexOptimizer };