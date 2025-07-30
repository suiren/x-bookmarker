#!/usr/bin/env node
import { config } from '../config';
import { getPool } from '../database/connection';
import { PerformanceAnalyzer } from '../utils/performanceAnalyzer';

async function main() {
  console.log('🔍 データベースパフォーマンス分析を開始します...');
  
  const db = getPool();
  const analyzer = new PerformanceAnalyzer(db);

  try {
    // テストユーザーを取得または作成
    const testUserId = await getOrCreateTestUser(db);
    console.log(`📊 テストユーザーID: ${testUserId}`);

    // パフォーマンス分析実行
    console.log('📈 主要クエリの分析中...');
    const report = await analyzer.analyzeMainQueries(testUserId);

    // レポート保存
    const reportPath = await analyzer.saveReport(report);
    console.log(`✅ パフォーマンスレポートを保存しました: ${reportPath}`);

    // コンソールにサマリーを表示
    displaySummary(report);

    // 重要な警告があれば表示
    displayWarnings(report);

  } catch (error) {
    console.error('❌ パフォーマンス分析でエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

async function getOrCreateTestUser(db: any): Promise<string> {
  // 既存のユーザーを検索
  const existingUser = await db.query(
    'SELECT id FROM users LIMIT 1'
  );

  if (existingUser.rows.length > 0) {
    return existingUser.rows[0].id;
  }

  // テストユーザーを作成
  const newUser = await db.query(`
    INSERT INTO users (
      x_user_id, username, display_name, email, avatar_url,
      access_token, refresh_token, token_expires_at
    ) VALUES (
      'test_user_12345',
      'performance_test_user',
      'Performance Test User',
      'test@example.com',
      null,
      'dummy_access_token',
      'dummy_refresh_token',
      NOW() + INTERVAL '1 hour'
    )
    RETURNING id
  `);

  // テストカテゴリを作成
  await db.query(`
    INSERT INTO categories (id, user_id, name, description, color, icon, "order", is_default)
    VALUES 
      ('00000000-0000-0000-0000-000000000001', $1, 'テスト技術', 'テスト用技術カテゴリ', '#3B82F6', 'cpu', 1, false),
      ('00000000-0000-0000-0000-000000000002', $1, 'テスト趣味', 'テスト用趣味カテゴリ', '#10B981', 'gamepad-2', 2, false)
    ON CONFLICT (id) DO NOTHING
  `, [newUser.rows[0].id]);

  // テストブックマークを作成
  const testBookmarks = [];
  for (let i = 1; i <= 100; i++) {
    testBookmarks.push(`
      ($${i * 12 - 11}, $${i * 12 - 10}, $${i * 12 - 9}, $${i * 12 - 8}, $${i * 12 - 7}, 
       $${i * 12 - 6}, $${i * 12 - 5}, $${i * 12 - 4}, $${i * 12 - 3}, $${i * 12 - 2}, 
       $${i * 12 - 1}, $${i * 12})
    `);
  }

  const bookmarkValues = [];
  for (let i = 1; i <= 100; i++) {
    bookmarkValues.push(
      newUser.rows[0].id,                                    // user_id
      `test_tweet_${i}`,                                     // x_tweet_id
      `This is test bookmark content ${i} with technology AI machine learning`, // content
      `test_author_${i % 10}`,                              // author_username
      `Test Author ${i % 10}`,                              // author_display_name
      null,                                                  // author_avatar_url
      ['https://example.com/image.jpg'],                     // media_urls
      ['https://example.com/link'],                          // links
      ['tech', 'AI', 'test'],                              // hashtags
      ['@testuser'],                                         // mentions
      i % 2 === 0 ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000002', // category_id
      ['AI', 'tech', `tag${i % 5}`]                        // tags
    );
  }

  if (bookmarkValues.length > 0) {
    await db.query(`
      INSERT INTO bookmarks (
        user_id, x_tweet_id, content, author_username, author_display_name,
        author_avatar_url, media_urls, links, hashtags, mentions, category_id, tags
      ) VALUES ${testBookmarks.join(', ')}
      ON CONFLICT (x_tweet_id) DO NOTHING
    `, bookmarkValues.flat());
  }

  // 検索履歴を作成
  for (let i = 1; i <= 20; i++) {
    await db.query(`
      INSERT INTO search_history (user_id, query, result_count, execution_time)
      VALUES ($1, $2, $3, $4)
    `, [
      newUser.rows[0].id,
      JSON.stringify({
        text: `search query ${i}`,
        categoryIds: i % 3 === 0 ? ['00000000-0000-0000-0000-000000000001'] : [],
        tags: i % 2 === 0 ? ['AI'] : [],
        limit: 20,
        offset: 0,
        sortBy: 'date',
        sortOrder: 'desc'
      }),
      Math.floor(Math.random() * 50) + 1,
      Math.floor(Math.random() * 1000) + 100
    ]);
  }

  console.log('✅ テストデータを作成しました');
  return newUser.rows[0].id;
}

function displaySummary(report: any) {
  console.log('\n📊 === パフォーマンス分析サマリー ===');
  console.log(`📈 総分析クエリ数: ${report.totalQueriesAnalyzed}`);
  console.log(`⏱️  平均実行時間: ${report.averageExecutionTime.toFixed(2)}ms`);
  console.log(`🐌 スロークエリ数: ${report.slowQueries.length}`);
  
  if (report.slowQueries.length > 0) {
    console.log('\n🚨 スロークエリ詳細:');
    report.slowQueries.forEach((sq: any, index: number) => {
      console.log(`  ${index + 1}. ${sq.endpoint || 'Unknown'}: ${sq.executionTime}ms`);
    });
  }

  const fastQueries = report.queryAnalyses.filter((q: any) => !q.isSlowQuery);
  console.log(`✅ 高速クエリ数: ${fastQueries.length}`);
  
  if (fastQueries.length > 0) {
    const avgFastTime = fastQueries.reduce((sum: number, q: any) => sum + q.executionTime, 0) / fastQueries.length;
    console.log(`⚡ 高速クエリ平均時間: ${avgFastTime.toFixed(2)}ms`);
  }
}

function displayWarnings(report: any) {
  console.log('\n⚠️  === 重要な警告とお勧め ===');
  
  const criticalSlowQueries = report.slowQueries.filter((q: any) => q.executionTime > 2000);
  if (criticalSlowQueries.length > 0) {
    console.log(`🔥 2秒以上のクリティカルなスロークエリが${criticalSlowQueries.length}個あります！`);
  }

  if (report.averageExecutionTime > 500) {
    console.log('🔥 平均実行時間が500msを超えています。緊急に最適化が必要です！');
  }

  // インデックス関連の警告
  const indexWarnings = report.indexSuggestions.filter((s: string) => 
    s.includes('未使用') || s.includes('使用されていません')
  );
  
  if (indexWarnings.length > 0) {
    console.log('📋 インデックス最適化が必要です:');
    indexWarnings.forEach((warning: string) => {
      console.log(`  - ${warning}`);
    });
  }

  console.log('\n🎯 次のアクション項目:');
  report.recommendations.slice(0, 5).forEach((rec: string, index: number) => {
    console.log(`  ${index + 1}. ${rec}`);
  });
}

// スクリプトとして実行された場合のみmainを実行
if (require.main === module) {
  main().then(() => {
    console.log('\n✨ パフォーマンス分析が完了しました');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ 分析中にエラーが発生しました:', error);
    process.exit(1);
  });
}

export { main as analyzePerformance };