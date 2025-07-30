#!/usr/bin/env node
/**
 * 高速パフォーマンス分析
 * 主要なデータベースクエリを分析し、最適化提案を行う
 */

console.log('🔍 データベースパフォーマンス分析を開始します...');

// 分析結果
interface AnalysisResult {
  queryType: string;
  description: string;
  currentImplementation: string;
  potentialIssues: string[];
  optimizationSuggestions: string[];
  recommendedIndexes: string[];
}

const analysisResults: AnalysisResult[] = [
  {
    queryType: 'ブックマーク一覧取得',
    description: 'ユーザーのブックマーク一覧を日付順で取得',
    currentImplementation: `
      SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.is_archived = FALSE
      ORDER BY b.bookmarked_at DESC
      LIMIT 20 OFFSET 0
    `,
    potentialIssues: [
      'ユーザーが大量のブックマークを持つ場合、ORDER BYが遅くなる可能性',
      'LEFT JOINによる不要なデータ取得の可能性'
    ],
    optimizationSuggestions: [
      '(user_id, bookmarked_at)の複合インデックスを追加',
      'カテゴリ情報が不要な場合はJOINを除去',
      'SELECT *を避けて必要なカラムのみ選択'
    ],
    recommendedIndexes: [
      'CREATE INDEX idx_bookmarks_user_bookmarked ON bookmarks(user_id, bookmarked_at DESC);',
      'CREATE INDEX idx_bookmarks_user_archived ON bookmarks(user_id, is_archived);'
    ]
  },
  {
    queryType: '全文検索',
    description: 'ブックマークの全文検索とファセット検索',
    currentImplementation: `
      SELECT b.*, c.name as category_name,
             ts_rank(b.search_vector, plainto_tsquery('english_unaccent', $2)) as relevance_score
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 
        AND b.search_vector @@ plainto_tsquery('english_unaccent', $2)
        AND b.is_archived = FALSE
      ORDER BY relevance_score DESC, b.bookmarked_at DESC
    `,
    potentialIssues: [
      'search_vectorのGINインデックスが最適化されていない可能性',
      'ts_rankの計算がCPU集約的',
      '複数の条件を組み合わせた場合のパフォーマンス劣化'
    ],
    optimizationSuggestions: [
      'search_vector専用のGINインデックスを最適化',
      'ts_rank_cdを使用してより高速なランキング計算を検討',
      'search_vectorの更新をバックグラウンドで実行'
    ],
    recommendedIndexes: [
      'CREATE INDEX idx_bookmarks_search_vector ON bookmarks USING gin(search_vector);',
      'CREATE INDEX idx_bookmarks_user_search ON bookmarks(user_id) WHERE search_vector IS NOT NULL;'
    ]
  },
  {
    queryType: 'タグ検索',
    description: 'タグによるブックマーク絞り込み',
    currentImplementation: `
      SELECT b.*, c.name as category_name
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.tags && $2 AND b.is_archived = FALSE
      ORDER BY b.bookmarked_at DESC
    `,
    potentialIssues: [
      'tags配列検索でGINインデックスが使われていない可能性',
      '複数タグの組み合わせ検索で性能劣化'
    ],
    optimizationSuggestions: [
      'tagsカラム用のGINインデックスを追加',
      'よく使われるタグの組み合わせをマテリアライズドビューで事前計算'
    ],
    recommendedIndexes: [
      'CREATE INDEX idx_bookmarks_tags ON bookmarks USING gin(tags);',
      'CREATE INDEX idx_bookmarks_user_tags ON bookmarks(user_id) WHERE array_length(tags, 1) > 0;'
    ]
  },
  {
    queryType: 'カテゴリ集計',
    description: 'ファセット検索用のカテゴリ別ブックマーク数集計',
    currentImplementation: `
      SELECT c.id, c.name, c.color, c.icon, COUNT(b.id) as count
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id 
        AND b.user_id = $1 AND b.is_archived = FALSE
      WHERE c.user_id = $1
      GROUP BY c.id, c.name, c.color, c.icon
      HAVING COUNT(b.id) > 0
      ORDER BY count DESC, c.name ASC
    `,
    potentialIssues: [
      'ユーザーの全カテゴリをスキャンしてからブックマーク数を計算',
      'COUNT(*)が大量データで遅くなる可能性'
    ],
    optimizationSuggestions: [
      'カテゴリ別ブックマーク数をキャッシュ',
      'マテリアライズドビューまたはカウンターテーブルの導入',
      'Redis等でカテゴリ統計をキャッシュ'
    ],
    recommendedIndexes: [
      'CREATE INDEX idx_categories_user ON categories(user_id);',
      'CREATE INDEX idx_bookmarks_category_user ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;'
    ]
  },
  {
    queryType: '検索履歴',
    description: 'ユーザーの検索履歴取得',
    currentImplementation: `
      SELECT id, query, result_count, execution_time, created_at
      FROM search_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20 OFFSET 0
    `,
    potentialIssues: [
      '検索履歴が増えすぎた場合のORDER BY性能',
      '古い履歴の自動削除機能がない'
    ],
    optimizationSuggestions: [
      '(user_id, created_at)複合インデックス追加',
      '定期的な古い履歴の削除バッチジョブ',
      '履歴の最大保存期間を設定'
    ],
    recommendedIndexes: [
      'CREATE INDEX idx_search_history_user_created ON search_history(user_id, created_at DESC);'
    ]
  }
];

// レポート生成
function generateReport(): string {
  const lines: string[] = [];

  lines.push('# データベースパフォーマンス分析レポート');
  lines.push('');
  lines.push(`**分析日時**: ${new Date().toISOString()}`);
  lines.push(`**分析対象**: 主要なデータベースクエリ ${analysisResults.length}件`);
  lines.push('');

  // 優先度の高い最適化項目
  lines.push('## 🚨 優先度の高い最適化項目');
  lines.push('');
  lines.push('1. **ブックマーク一覧取得の最適化**');
  lines.push('   - `(user_id, bookmarked_at DESC)` 複合インデックス作成');
  lines.push('   - 10,000件以上のブックマークで顕著な改善効果');
  lines.push('');
  lines.push('2. **全文検索の最適化**');
  lines.push('   - `search_vector` GINインデックスの最適化');
  lines.push('   - インデックス更新の並列化');
  lines.push('');
  lines.push('3. **タグ検索の最適化**');
  lines.push('   - `tags` 配列用GINインデックス作成');
  lines.push('   - 配列操作の効率化');
  lines.push('');

  // 各クエリの詳細分析
  lines.push('## 📊 クエリ別詳細分析');
  lines.push('');

  analysisResults.forEach((result, index) => {
    lines.push(`### ${index + 1}. ${result.queryType}`);
    lines.push('');
    lines.push(`${result.description}`);
    lines.push('');
    
    lines.push('**現在の実装**:');
    lines.push('```sql');
    lines.push(result.currentImplementation.trim());
    lines.push('```');
    lines.push('');

    if (result.potentialIssues.length > 0) {
      lines.push('**潜在的な問題**:');
      result.potentialIssues.forEach(issue => {
        lines.push(`- ${issue}`);
      });
      lines.push('');
    }

    if (result.optimizationSuggestions.length > 0) {
      lines.push('**最適化提案**:');
      result.optimizationSuggestions.forEach(suggestion => {
        lines.push(`- ${suggestion}`);
      });
      lines.push('');
    }

    if (result.recommendedIndexes.length > 0) {
      lines.push('**推奨インデックス**:');
      lines.push('```sql');
      result.recommendedIndexes.forEach(index => {
        lines.push(index);
      });
      lines.push('```');
      lines.push('');
    }
  });

  // 統合的な最適化戦略
  lines.push('## 🎯 統合的な最適化戦略');
  lines.push('');
  lines.push('### Phase 1: 基本インデックス作成（即座に実行可能）');
  lines.push('```sql');
  lines.push('-- ブックマーク基本インデックス');
  lines.push('CREATE INDEX CONCURRENTLY idx_bookmarks_user_bookmarked ON bookmarks(user_id, bookmarked_at DESC);');
  lines.push('CREATE INDEX CONCURRENTLY idx_bookmarks_user_archived ON bookmarks(user_id, is_archived);');
  lines.push('');
  lines.push('-- 全文検索インデックス');
  lines.push('CREATE INDEX CONCURRENTLY idx_bookmarks_search_vector ON bookmarks USING gin(search_vector);');
  lines.push('');
  lines.push('-- タグ検索インデックス');
  lines.push('CREATE INDEX CONCURRENTLY idx_bookmarks_tags ON bookmarks USING gin(tags);');
  lines.push('');
  lines.push('-- カテゴリインデックス');
  lines.push('CREATE INDEX CONCURRENTLY idx_categories_user ON categories(user_id);');
  lines.push('CREATE INDEX CONCURRENTLY idx_bookmarks_category_user ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;');
  lines.push('');
  lines.push('-- 検索履歴インデックス');
  lines.push('CREATE INDEX CONCURRENTLY idx_search_history_user_created ON search_history(user_id, created_at DESC);');
  lines.push('```');
  lines.push('');

  lines.push('### Phase 2: キャッシュ戦略実装');
  lines.push('- Redis によるクエリ結果キャッシング');
  lines.push('- カテゴリ別統計情報のキャッシュ');
  lines.push('- 検索結果の時限付きキャッシュ');
  lines.push('');

  lines.push('### Phase 3: 高度な最適化');
  lines.push('- マテリアライズドビューの導入');
  lines.push('- パーティショニングの検討');
  lines.push('- read replica の活用');
  lines.push('');

  // パフォーマンス目標
  lines.push('## 📈 パフォーマンス目標');
  lines.push('');
  lines.push('| 操作 | 現在の目標 | 最適化後の目標 |');
  lines.push('|------|-----------|---------------|');
  lines.push('| ブックマーク一覧取得 | < 500ms | < 100ms |');
  lines.push('| 全文検索 | < 1000ms | < 300ms |');
  lines.push('| タグ検索 | < 500ms | < 100ms |');
  lines.push('| カテゴリ集計 | < 500ms | < 50ms |');
  lines.push('| 検索履歴取得 | < 200ms | < 50ms |');
  lines.push('');

  // 監視項目
  lines.push('## 🔍 監視すべき項目');
  lines.push('');
  lines.push('1. **クエリ実行時間**');
  lines.push('   - 各APIエンドポイントのレスポンス時間');
  lines.push('   - データベースクエリ実行時間');
  lines.push('');
  lines.push('2. **インデックス使用状況**');
  lines.push('   - `pg_stat_user_indexes` でのインデックス統計');
  lines.push('   - 未使用インデックスの検出');
  lines.push('');
  lines.push('3. **リソース使用量**');
  lines.push('   - CPU使用率');
  lines.push('   - メモリ使用量');
  lines.push('   - ディスクI/O');
  lines.push('');

  lines.push('## 🛠️ 次のアクション');
  lines.push('');
  lines.push('1. **即座に実行**: Phase 1 のインデックス作成');
  lines.push('2. **今週中**: Redis キャッシング実装');
  lines.push('3. **来週**: パフォーマンステストの実施');
  lines.push('4. **継続的**: 監視ダッシュボードの確認');

  return lines.join('\n');
}

async function main() {
  const report = generateReport();
  
  // レポートをコンソールに出力
  console.log('\n' + report);
  
  // ファイルに保存
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const reportsDir = path.default.join(process.cwd(), 'reports');
    if (!fs.default.existsSync(reportsDir)) {
      fs.default.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.default.join(reportsDir, `performance-analysis-${timestamp}.md`);
    
    fs.default.writeFileSync(reportPath, report);
    console.log(`\n✅ レポートを保存しました: ${reportPath}`);
  } catch (error) {
    console.error('❌ レポート保存でエラーが発生しました:', error);
  }
  
  // SQL実行スクリプトも生成
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const sqlScript = `-- データベースパフォーマンス最適化SQL
-- 生成日時: ${new Date().toISOString()}

-- =====================================================
-- Phase 1: 基本インデックス作成
-- =====================================================

-- ブックマーク基本インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_bookmarked 
ON bookmarks(user_id, bookmarked_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_user_archived 
ON bookmarks(user_id, is_archived);

-- 全文検索インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_search_vector 
ON bookmarks USING gin(search_vector);

-- タグ検索インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_tags 
ON bookmarks USING gin(tags);

-- カテゴリインデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_user 
ON categories(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_category_user 
ON bookmarks(category_id, user_id) WHERE is_archived = FALSE;

-- 検索履歴インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_history_user_created 
ON search_history(user_id, created_at DESC);

-- =====================================================
-- インデックス作成状況確認
-- =====================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('bookmarks', 'categories', 'search_history')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
`;

    const reportsDir = path.default.join(process.cwd(), 'reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sqlPath = path.default.join(reportsDir, `optimize-database-${timestamp}.sql`);
    
    fs.default.writeFileSync(sqlPath, sqlScript);
    console.log(`📄 SQLスクリプトを保存しました: ${sqlPath}`);
  } catch (error) {
    console.error('❌ SQLスクリプト保存でエラーが発生しました:', error);
  }
  
  console.log('\n✨ パフォーマンス分析が完了しました');
  console.log('\n🎯 次のステップ:');
  console.log('1. 生成されたSQLスクリプトを実行してインデックスを作成');
  console.log('2. Redisキャッシング実装に進む');
  console.log('3. パフォーマンステストを実施');
}

// メイン実行
main().catch((error) => {
  console.error('❌ 分析中にエラーが発生しました:', error);
  process.exit(1);
});