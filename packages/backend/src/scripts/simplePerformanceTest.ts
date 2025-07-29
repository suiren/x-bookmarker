#!/usr/bin/env node
/**
 * 簡単なパフォーマンステスト
 * Dockerを使わずにSQLクエリの分析を行う
 */

import { readFileSync } from 'fs';
import path from 'path';

interface QueryAnalysis {
  queryName: string;
  query: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  potentialIssues: string[];
  suggestions: string[];
}

class SimplePerformanceAnalyzer {
  private queries: { name: string; query: string }[] = [];

  constructor() {
    this.loadQueriesFromServices();
  }

  /**
   * サービスファイルからクエリを抽出
   */
  private loadQueriesFromServices() {
    const serviceFiles = [
      'src/services/bookmarkService.ts',
      'src/services/searchService.ts',
      'src/services/categoryService.ts',
    ];

    serviceFiles.forEach(filePath => {
      try {
        const fullPath = path.join(process.cwd(), filePath);
        const content = readFileSync(fullPath, 'utf-8');
        this.extractQueriesFromFile(content, path.basename(filePath));
        console.log(`✅ ${filePath}から${this.queries.length}個のクエリを抽出しました`);
      } catch (error) {
        console.warn(`Could not read ${filePath}: ${error}`);
      }
    });
  }

  /**
   * ファイルからSQLクエリを抽出
   */
  private extractQueriesFromFile(content: string, fileName: string) {
    // SQLクエリを抽出するための正規表現
    const queryRegex = /(?:await\s+(?:this\.)?db\.query\s*\(\s*`([^`]+)`|"([^"]+(?:\s+[^"]+)*)"|'([^']+(?:\s+[^']+)*)')/gm;
    
    let match;
    let index = 0;
    
    while ((match = queryRegex.exec(content)) !== null) {
      const query = (match[1] || match[2] || match[3] || '').trim();
      
      // SQLクエリっぽいものだけを抽出
      if (this.looksLikeSQL(query)) {
        this.queries.push({
          name: `${fileName.replace('.ts', '')}_query_${++index}`,
          query: this.cleanQuery(query),
        });
      }
    }
  }

  /**
   * 文字列がSQLクエリかどうかを判定
   */
  private looksLikeSQL(text: string): boolean {
    const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'FROM', 'WHERE', 'JOIN'];
    const upperText = text.toUpperCase();
    return sqlKeywords.some(keyword => upperText.includes(keyword)) && text.length > 20;
  }

  /**
   * クエリを整理
   */
  private cleanQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\${?\d+}?/g, '$PARAM'); // パラメータプレースホルダを正規化
  }

  /**
   * 全クエリを分析
   */
  analyzeQueries(): QueryAnalysis[] {
    return this.queries.map(({ name, query }) => this.analyzeQuery(name, query));
  }

  /**
   * 単一クエリの分析
   */
  private analyzeQuery(queryName: string, query: string): QueryAnalysis {
    const analysis: QueryAnalysis = {
      queryName,
      query,
      complexity: this.assessComplexity(query),
      potentialIssues: [],
      suggestions: [],
    };

    // 潜在的な問題を検出
    this.detectPotentialIssues(query, analysis);
    
    // 改善提案を生成
    this.generateSuggestions(query, analysis);

    return analysis;
  }

  /**
   * クエリの複雑さを評価
   */
  private assessComplexity(query: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const upperQuery = query.toUpperCase();
    let complexity = 0;

    // 複雑さのスコア計算
    if (upperQuery.includes('JOIN')) complexity += 2;
    if (upperQuery.includes('LEFT JOIN') || upperQuery.includes('RIGHT JOIN')) complexity += 1;
    if (upperQuery.includes('SUBQUERY') || upperQuery.includes('WITH')) complexity += 3;
    if (upperQuery.includes('GROUP BY')) complexity += 1;
    if (upperQuery.includes('ORDER BY')) complexity += 1;
    if (upperQuery.includes('UNION')) complexity += 2;
    if ((upperQuery.match(/SELECT/g) || []).length > 1) complexity += 2;
    if (upperQuery.includes('CASE WHEN')) complexity += 1;

    if (complexity <= 2) return 'LOW';
    if (complexity <= 5) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * 潜在的な問題を検出
   */
  private detectPotentialIssues(query: string, analysis: QueryAnalysis) {
    const upperQuery = query.toUpperCase();

    // N+1クエリの可能性
    if (upperQuery.includes('WHERE') && upperQuery.includes('= $PARAM') && !upperQuery.includes('JOIN')) {
      analysis.potentialIssues.push('N+1クエリの可能性があります');
    }

    // LIKE演算子での前方ワイルドカード
    if (upperQuery.includes("LIKE '%")) {
      analysis.potentialIssues.push('前方ワイルドカード（LIKE \'%...\'）はインデックスを使用できません');
    }

    // ORDER BYなしのLIMIT
    if (upperQuery.includes('LIMIT') && !upperQuery.includes('ORDER BY')) {
      analysis.potentialIssues.push('ORDER BYなしのLIMITは結果が不安定になる可能性があります');
    }

    // SELECT *の使用
    if (upperQuery.includes('SELECT *')) {
      analysis.potentialIssues.push('SELECT *は必要以上のデータを取得する可能性があります');
    }

    // サブクエリの使用
    if (upperQuery.includes('IN (SELECT') || upperQuery.includes('EXISTS (SELECT')) {
      analysis.potentialIssues.push('サブクエリが使用されています。JOINで置き換え可能か検討してください');
    }

    // 複雑なWHERE条件
    const whereCount = (upperQuery.match(/WHERE|AND|OR/g) || []).length;
    if (whereCount > 5) {
      analysis.potentialIssues.push('WHERE条件が複雑です。インデックス戦略を確認してください');
    }
  }

  /**
   * 改善提案を生成
   */
  private generateSuggestions(query: string, analysis: QueryAnalysis) {
    const upperQuery = query.toUpperCase();

    // インデックス関連の提案
    if (upperQuery.includes('WHERE') && upperQuery.includes('USER_ID')) {
      analysis.suggestions.push('user_idカラムにインデックスが設定されていることを確認してください');
    }

    if (upperQuery.includes('ORDER BY') && upperQuery.includes('BOOKMARKED_AT')) {
      analysis.suggestions.push('bookmarked_atカラムにインデックスを設定することを検討してください');
    }

    if (upperQuery.includes('SEARCH_VECTOR')) {
      analysis.suggestions.push('search_vectorカラムにGINインデックスが設定されていることを確認してください');
    }

    if (upperQuery.includes('TAGS')) {
      analysis.suggestions.push('tagsカラム（配列）にGINインデックスを設定することを検討してください');
    }

    // JOINの最適化
    if (upperQuery.includes('LEFT JOIN')) {
      analysis.suggestions.push('LEFT JOINは必要な場合のみ使用し、INNER JOINで代替可能か検討してください');
    }

    // 複合インデックスの提案
    if (upperQuery.includes('USER_ID') && upperQuery.includes('IS_ARCHIVED')) {
      analysis.suggestions.push('(user_id, is_archived)の複合インデックスを検討してください');
    }

    if (upperQuery.includes('USER_ID') && upperQuery.includes('CREATED_AT')) {
      analysis.suggestions.push('(user_id, created_at)の複合インデックスを検討してください');
    }

    // パフォーマンス一般
    if (analysis.complexity === 'HIGH') {
      analysis.suggestions.push('複雑なクエリです。分割できないか検討してください');
      analysis.suggestions.push('EXPLAIN ANALYZEを実行して実行計画を確認してください');
    }

    if (upperQuery.includes('COUNT(*)')) {
      analysis.suggestions.push('COUNT(*)は大きなテーブルで遅くなる可能性があります。概算値で十分な場合は別の手法を検討してください');
    }
  }

  /**
   * レポートを生成
   */
  generateReport(): string {
    const analyses = this.analyzeQueries();
    const lines: string[] = [];

    lines.push('# データベースクエリ静的分析レポート');
    lines.push('');
    lines.push(`**分析日時**: ${new Date().toISOString()}`);
    lines.push(`**分析クエリ数**: ${analyses.length}`);
    lines.push('');

    // サマリー
    const complexityStats = {
      LOW: analyses.filter(a => a.complexity === 'LOW').length,
      MEDIUM: analyses.filter(a => a.complexity === 'MEDIUM').length,
      HIGH: analyses.filter(a => a.complexity === 'HIGH').length,
    };

    lines.push('## 複雑さ別クエリ数');
    lines.push(`- 低: ${complexityStats.LOW}`);
    lines.push(`- 中: ${complexityStats.MEDIUM}`);
    lines.push(`- 高: ${complexityStats.HIGH}`);
    lines.push('');

    // 問題のあるクエリ
    const problematicQueries = analyses.filter(a => a.potentialIssues.length > 0);
    if (problematicQueries.length > 0) {
      lines.push('## 潜在的な問題があるクエリ');
      lines.push('');
      problematicQueries.forEach((analysis, index) => {
        lines.push(`### ${index + 1}. ${analysis.queryName}`);
        lines.push(`**複雑さ**: ${analysis.complexity}`);
        lines.push('');
        lines.push('**潜在的な問題**:');
        analysis.potentialIssues.forEach(issue => {
          lines.push(`- ${issue}`);
        });
        lines.push('');
        lines.push('**改善提案**:');
        analysis.suggestions.forEach(suggestion => {
          lines.push(`- ${suggestion}`);
        });
        lines.push('');
        lines.push('```sql');
        lines.push(analysis.query);
        lines.push('```');
        lines.push('');
      });
    }

    // 高複雑度クエリ
    const highComplexityQueries = analyses.filter(a => a.complexity === 'HIGH');
    if (highComplexityQueries.length > 0) {
      lines.push('## 高複雑度クエリ');
      lines.push('');
      highComplexityQueries.forEach((analysis, index) => {
        lines.push(`### ${index + 1}. ${analysis.queryName}`);
        lines.push('```sql');
        lines.push(analysis.query);
        lines.push('```');
        lines.push('');
        if (analysis.suggestions.length > 0) {
          lines.push('**改善提案**:');
          analysis.suggestions.forEach(suggestion => {
            lines.push(`- ${suggestion}`);
          });
          lines.push('');
        }
      });
    }

    // 全体的な推奨事項
    lines.push('## 全体的な推奨事項');
    lines.push('');
    lines.push('### インデックス戦略');
    lines.push('- `bookmarks(user_id, bookmarked_at)` - ユーザー別ブックマーク取得用');
    lines.push('- `bookmarks(user_id, is_archived)` - アーカイブフラグでの絞り込み用');
    lines.push('- `search_vector` GINインデックス - 全文検索用');
    lines.push('- `tags` GINインデックス - 配列検索用');
    lines.push('- `categories(user_id, order)` - カテゴリ並び順用');
    lines.push('- `search_history(user_id, created_at)` - 検索履歴取得用');
    lines.push('');
    lines.push('### クエリ最適化');
    lines.push('- SELECT文では必要なカラムのみを指定');
    lines.push('- JOINの順序を最適化（小さなテーブルから）');
    lines.push('- WHERE条件の順序を最適化（選択性の高い条件から）');
    lines.push('- 適切なLIMITとOFFSETの使用');
    lines.push('');
    lines.push('### パフォーマンス監視');
    lines.push('- 定期的にEXPLAIN ANALYZEでクエリ実行計画をチェック');
    lines.push('- スロークエリログの監視');
    lines.push('- インデックス使用状況の確認');

    return lines.join('\n');
  }
}

async function main() {
  console.log('🔍 データベースクエリ静的分析を開始します...');
  
  const analyzer = new SimplePerformanceAnalyzer();
  const report = analyzer.generateReport();
  
  // レポートをコンソールに出力
  console.log('\n' + report);
  
  // ファイルに保存
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const reportsDir = path.default.join(process.cwd(), 'reports');
    if (!fs.default.existsSync(reportsDir)) {
      fs.default.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.default.join(reportsDir, `static-analysis-${timestamp}.md`);
    
    fs.default.writeFileSync(reportPath, report);
    console.log(`\n✅ レポートを保存しました: ${reportPath}`);
  } catch (error) {
    console.error('❌ レポート保存でエラーが発生しました:', error);
  }
  
  console.log('\n✨ 静的分析が完了しました');
}

// スクリプトとして実行された場合のみmainを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ 分析中にエラーが発生しました:', error);
    process.exit(1);
  });
}

export { SimplePerformanceAnalyzer };