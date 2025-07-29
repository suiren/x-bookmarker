import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

interface QueryAnalysis {
  query: string;
  params: any[];
  executionPlan: any[];
  executionTime: number;
  planningTime: number;
  totalRows: number;
  actualTime: number;
  isSlowQuery: boolean;
  suggestions: string[];
}

interface SlowQueryLog {
  query: string;
  params: any[];
  executionTime: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
}

interface PerformanceReport {
  timestamp: Date;
  totalQueriesAnalyzed: number;
  slowQueries: SlowQueryLog[];
  averageExecutionTime: number;
  queryAnalyses: QueryAnalysis[];
  indexSuggestions: string[];
  recommendations: string[];
}

class PerformanceAnalyzer {
  private slowQueryThreshold: number = 1000; // 1秒以上をスロークエリとする
  private slowQueries: SlowQueryLog[] = [];

  constructor(private db: Pool) {}

  /**
   * 指定されたクエリのパフォーマンス分析を実行
   */
  async analyzeQuery(
    query: string,
    params: any[] = [],
    userId?: string,
    endpoint?: string
  ): Promise<QueryAnalysis> {
    const startTime = Date.now();

    // EXPLAIN ANALYZE実行
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
    
    try {
      const result = await this.db.query(explainQuery, params);
      const executionTime = Date.now() - startTime;
      const plan = result.rows[0]['QUERY PLAN'][0];

      const analysis: QueryAnalysis = {
        query,
        params,
        executionPlan: result.rows[0]['QUERY PLAN'],
        executionTime,
        planningTime: plan['Planning Time'],
        totalRows: plan['Plan']['Actual Rows'] || 0,
        actualTime: plan['Execution Time'],
        isSlowQuery: executionTime > this.slowQueryThreshold,
        suggestions: this.generateSuggestions(plan, query),
      };

      // スロークエリログに記録
      if (analysis.isSlowQuery) {
        this.slowQueries.push({
          query,
          params,
          executionTime,
          timestamp: new Date(),
          userId,
          endpoint,
        });
      }

      return analysis;
    } catch (error) {
      throw new Error(`Query analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 主要なデータベースクエリのパフォーマンス分析を実行
   */
  async analyzeMainQueries(userId: string): Promise<PerformanceReport> {
    const startTime = Date.now();
    const queryAnalyses: QueryAnalysis[] = [];

    // 分析対象のクエリリスト
    const testQueries = [
      // ブックマーク一覧取得（基本）
      {
        name: 'getUserBookmarks_basic',
        query: `
          SELECT 
            b.*,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon
          FROM bookmarks b
          LEFT JOIN categories c ON b.category_id = c.id
          WHERE b.user_id = $1 AND b.is_archived = FALSE
          ORDER BY b.bookmarked_at DESC 
          LIMIT 20 OFFSET 0
        `,
        params: [userId],
      },
      // ブックマーク検索（全文検索）
      {
        name: 'searchBookmarks_fulltext',
        query: `
          SELECT 
            b.*,
            c.name as category_name,
            ts_rank(b.search_vector, plainto_tsquery('english_unaccent', $2)) as relevance_score
          FROM bookmarks b
          LEFT JOIN categories c ON b.category_id = c.id
          WHERE b.user_id = $1 
            AND b.search_vector @@ plainto_tsquery('english_unaccent', $2)
            AND b.is_archived = FALSE
          ORDER BY relevance_score DESC, b.bookmarked_at DESC
          LIMIT 20 OFFSET 0
        `,
        params: [userId, 'technology'],
      },
      // カテゴリ別ブックマーク取得
      {
        name: 'getUserBookmarks_byCategory',
        query: `
          SELECT 
            b.*,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon
          FROM bookmarks b
          LEFT JOIN categories c ON b.category_id = c.id
          WHERE b.user_id = $1 
            AND b.category_id = $2
            AND b.is_archived = FALSE
          ORDER BY b.bookmarked_at DESC
          LIMIT 20 OFFSET 0
        `,
        params: [userId, '00000000-0000-0000-0000-000000000001'], // テスト用カテゴリID
      },
      // タグ検索
      {
        name: 'searchBookmarks_byTags',
        query: `
          SELECT 
            b.*,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon
          FROM bookmarks b
          LEFT JOIN categories c ON b.category_id = c.id
          WHERE b.user_id = $1 
            AND b.tags && $2
            AND b.is_archived = FALSE
          ORDER BY b.bookmarked_at DESC
          LIMIT 20 OFFSET 0
        `,
        params: [userId, ['AI', 'tech']],
      },
      // ファセット検索（カテゴリ集計）
      {
        name: 'getFacets_categories',
        query: `
          SELECT 
            c.id,
            c.name,
            c.color,
            c.icon,
            COUNT(b.id) as count
          FROM categories c
          LEFT JOIN bookmarks b ON c.id = b.category_id 
            AND b.user_id = $1 
            AND b.is_archived = FALSE
          WHERE c.user_id = $1
          GROUP BY c.id, c.name, c.color, c.icon
          HAVING COUNT(b.id) > 0
          ORDER BY count DESC, c.name ASC
          LIMIT 20
        `,
        params: [userId],
      },
      // 検索履歴取得
      {
        name: 'getSearchHistory',
        query: `
          SELECT 
            id,
            query,
            result_count,
            execution_time,
            created_at
          FROM search_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 20 OFFSET 0
        `,
        params: [userId],
      },
    ];

    // 各クエリを分析
    for (const testQuery of testQueries) {
      try {
        const analysis = await this.analyzeQuery(
          testQuery.query,
          testQuery.params,
          userId,
          testQuery.name
        );
        queryAnalyses.push(analysis);
      } catch (error) {
        console.warn(`Failed to analyze query ${testQuery.name}:`, error);
      }
    }

    // インデックス使用状況の分析
    const indexSuggestions = await this.analyzeIndexUsage();

    const totalTime = Date.now() - startTime;
    const averageExecutionTime = queryAnalyses.length > 0 
      ? queryAnalyses.reduce((sum, q) => sum + q.executionTime, 0) / queryAnalyses.length
      : 0;

    const report: PerformanceReport = {
      timestamp: new Date(),
      totalQueriesAnalyzed: queryAnalyses.length,
      slowQueries: this.slowQueries.slice(-10), // 最新10件のスロークエリ
      averageExecutionTime,
      queryAnalyses,
      indexSuggestions,
      recommendations: this.generateRecommendations(queryAnalyses),
    };

    return report;
  }

  /**
   * インデックス使用状況の分析
   */
  private async analyzeIndexUsage(): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // 未使用インデックスの検出
      const unusedIndexes = await this.db.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE idx_tup_read = 0 AND idx_tup_fetch = 0
        ORDER BY schemaname, tablename, indexname
      `);

      if (unusedIndexes.rows.length > 0) {
        suggestions.push(`未使用インデックスが${unusedIndexes.rows.length}個検出されました。削除を検討してください。`);
        unusedIndexes.rows.forEach(row => {
          suggestions.push(`- ${row.tablename}.${row.indexname}`);
        });
      }

      // テーブルサイズとインデックスサイズの分析
      const tableSizes = await this.db.query(`
        SELECT 
          tablename,
          pg_size_pretty(pg_total_relation_size(tablename::regclass)) as total_size,
          pg_size_pretty(pg_relation_size(tablename::regclass)) as table_size,
          pg_size_pretty(pg_total_relation_size(tablename::regclass) - pg_relation_size(tablename::regclass)) as index_size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(tablename::regclass) DESC
      `);

      if (tableSizes.rows.length > 0) {
        suggestions.push('テーブルサイズ情報:');
        tableSizes.rows.forEach(row => {
          suggestions.push(`- ${row.tablename}: Total ${row.total_size} (Table: ${row.table_size}, Indexes: ${row.index_size})`);
        });
      }

      // search_vectorインデックスの使用状況確認
      const searchVectorStats = await this.db.query(`
        SELECT 
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
        FROM pg_stat_user_indexes
        WHERE indexname LIKE '%search_vector%'
      `);

      if (searchVectorStats.rows.length > 0) {
        const stats = searchVectorStats.rows[0];
        if (stats.idx_scan === 0) {
          suggestions.push('全文検索インデックス(search_vector)が使用されていません。クエリを確認してください。');
        } else {
          suggestions.push(`全文検索インデックス使用統計: スキャン${stats.idx_scan}回, 読み取り${stats.idx_tup_read}タプル`);
        }
      }

    } catch (error) {
      suggestions.push(`インデックス分析でエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return suggestions;
  }

  /**
   * 実行計画からパフォーマンス改善提案を生成
   */
  private generateSuggestions(plan: any, query: string): string[] {
    const suggestions: string[] = [];

    const mainPlan = plan.Plan;

    // Seq Scanの検出
    if (this.containsSeqScan(mainPlan)) {
      suggestions.push('Sequential Scanが検出されました。適切なインデックスの追加を検討してください。');
    }

    // Hash Joinの検出
    if (this.containsHashJoin(mainPlan)) {
      suggestions.push('Hash Joinが使用されています。JOINするテーブルのサイズと頻度を確認してください。');
    }

    // 高コストな操作の検出
    if (mainPlan['Total Cost'] > 1000) {
      suggestions.push(`クエリのコストが高くなっています (${mainPlan['Total Cost']})。インデックスの最適化を検討してください。`);
    }

    // Sortの検出
    if (this.containsSort(mainPlan)) {
      suggestions.push('ソート操作が含まれています。ORDER BYに対応するインデックスの追加を検討してください。');
    }

    // 全文検索の最適化提案
    if (query.includes('plainto_tsquery') || query.includes('search_vector')) {
      if (!this.containsGinIndex(mainPlan)) {
        suggestions.push('全文検索でGINインデックスが使用されていない可能性があります。search_vectorのインデックスを確認してください。');
      }
    }

    // 配列検索の最適化
    if (query.includes('&& $') || query.includes('= ANY(')) {
      if (!this.containsGinIndex(mainPlan)) {
        suggestions.push('配列検索でGINインデックスの使用を検討してください。');
      }
    }

    return suggestions;
  }

  /**
   * 総合的なパフォーマンス改善提案を生成
   */
  private generateRecommendations(analyses: QueryAnalysis[]): string[] {
    const recommendations: string[] = [];

    const slowQueries = analyses.filter(a => a.isSlowQuery);
    if (slowQueries.length > 0) {
      recommendations.push(`${slowQueries.length}個のスロークエリが検出されました。優先的に最適化してください。`);
    }

    const avgTime = analyses.reduce((sum, a) => sum + a.executionTime, 0) / analyses.length;
    if (avgTime > 500) {
      recommendations.push(`平均実行時間が${avgTime.toFixed(2)}msです。500ms以下を目標に最適化してください。`);
    }

    // 共通の最適化提案
    recommendations.push('推奨最適化項目:');
    recommendations.push('1. bookmarks.user_id, bookmarks.bookmarked_at の複合インデックス追加');
    recommendations.push('2. bookmarks.search_vector のGINインデックスが最新か確認');
    recommendations.push('3. bookmarks.tags のGINインデックス追加検討');
    recommendations.push('4. categories.user_id のインデックス確認');
    recommendations.push('5. search_history.user_id, created_at の複合インデックス追加');

    return recommendations;
  }

  /**
   * パフォーマンスレポートをファイルに保存
   */
  async saveReport(report: PerformanceReport, filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = filename || `performance-report-${timestamp}.json`;
    const reportsDir = path.join(process.cwd(), 'reports');
    
    try {
      await fs.mkdir(reportsDir, { recursive: true });
      const filepath = path.join(reportsDir, reportFilename);
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      
      // 人間が読みやすい形式のレポートも生成
      const readableReport = this.generateReadableReport(report);
      const readableFilename = reportFilename.replace('.json', '.md');
      const readableFilepath = path.join(reportsDir, readableFilename);
      await fs.writeFile(readableFilepath, readableReport);
      
      return filepath;
    } catch (error) {
      throw new Error(`Failed to save report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 人間が読みやすい形式のレポートを生成
   */
  private generateReadableReport(report: PerformanceReport): string {
    const lines: string[] = [];
    
    lines.push('# データベースパフォーマンスレポート');
    lines.push('');
    lines.push(`**生成日時**: ${report.timestamp.toISOString()}`);
    lines.push(`**分析クエリ数**: ${report.totalQueriesAnalyzed}`);
    lines.push(`**平均実行時間**: ${report.averageExecutionTime.toFixed(2)}ms`);
    lines.push(`**スロークエリ数**: ${report.slowQueries.length}`);
    lines.push('');

    if (report.slowQueries.length > 0) {
      lines.push('## スロークエリ');
      lines.push('');
      report.slowQueries.forEach((sq, index) => {
        lines.push(`### ${index + 1}. ${sq.endpoint || 'Unknown'}`);
        lines.push(`- 実行時間: ${sq.executionTime}ms`);
        lines.push(`- 実行日時: ${sq.timestamp.toISOString()}`);
        lines.push('```sql');
        lines.push(sq.query.trim());
        lines.push('```');
        lines.push('');
      });
    }

    lines.push('## クエリ分析結果');
    lines.push('');
    report.queryAnalyses.forEach((analysis, index) => {
      lines.push(`### ${index + 1}. クエリ分析`);
      lines.push(`- 実行時間: ${analysis.executionTime}ms`);
      lines.push(`- 計画時間: ${analysis.planningTime}ms`);
      lines.push(`- 処理行数: ${analysis.totalRows}`);
      lines.push(`- スロークエリ: ${analysis.isSlowQuery ? 'はい' : 'いいえ'}`);
      
      if (analysis.suggestions.length > 0) {
        lines.push('#### 改善提案');
        analysis.suggestions.forEach(suggestion => {
          lines.push(`- ${suggestion}`);
        });
      }
      lines.push('');
    });

    if (report.indexSuggestions.length > 0) {
      lines.push('## インデックス分析');
      lines.push('');
      report.indexSuggestions.forEach(suggestion => {
        lines.push(`- ${suggestion}`);
      });
      lines.push('');
    }

    lines.push('## 総合的な推奨事項');
    lines.push('');
    report.recommendations.forEach(rec => {
      lines.push(`- ${rec}`);
    });

    return lines.join('\n');
  }

  // プライベートヘルパーメソッド

  private containsSeqScan(plan: any): boolean {
    if (plan['Node Type'] === 'Seq Scan') return true;
    if (plan.Plans) {
      return plan.Plans.some((childPlan: any) => this.containsSeqScan(childPlan));
    }
    return false;
  }

  private containsHashJoin(plan: any): boolean {
    if (plan['Node Type'] === 'Hash Join') return true;
    if (plan.Plans) {
      return plan.Plans.some((childPlan: any) => this.containsHashJoin(childPlan));
    }
    return false;
  }

  private containsSort(plan: any): boolean {
    if (plan['Node Type'] === 'Sort') return true;
    if (plan.Plans) {
      return plan.Plans.some((childPlan: any) => this.containsSort(childPlan));
    }
    return false;
  }

  private containsGinIndex(plan: any): boolean {
    if (plan['Index Name'] && plan['Index Name'].includes('gin')) return true;
    if (plan.Plans) {
      return plan.Plans.some((childPlan: any) => this.containsGinIndex(childPlan));
    }
    return false;
  }

  /**
   * スロークエリログをクリア
   */
  clearSlowQueryLog(): void {
    this.slowQueries = [];
  }

  /**
   * スロークエリ閾値を設定
   */
  setSlowQueryThreshold(milliseconds: number): void {
    this.slowQueryThreshold = milliseconds;
  }
}

export { PerformanceAnalyzer };
export type { QueryAnalysis, SlowQueryLog, PerformanceReport };