/**
 * データベースシード機能
 * 
 * 💡 シードとは:
 * 開発やテストで使用する初期データを自動挿入する機能
 * - デモユーザーの作成
 * - サンプルブックマークの挿入
 * - デフォルトカテゴリの確認
 */

import { migrate } from './migrate';
import { query, withTransaction } from './connection';

interface SeedResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * シード実行の必要性をチェック
 * 
 * 💡 ユーザーが存在しない場合のみシード実行
 */
const checkSeedStatus = async (): Promise<boolean> => {
  try {
    const userCount = await query<{ count: string }>('SELECT COUNT(*) FROM users');
    const count = parseInt(userCount.rows[0].count);
    
    console.log(`👥 現在のユーザー数: ${count}`);
    return count === 0;
  } catch (error) {
    console.log('📊 データベーステーブルが見つかりません。マイグレーションが必要です');
    return true;
  }
};

/**
 * デモユーザーの作成
 * 
 * 💡 デモユーザー作成時にトリガーが自動実行され、
 * デフォルトカテゴリが自動で作成されます
 */
const createDemoUser = async (): Promise<string> => {
  const demoUser = {
    x_user_id: 'demo_user_123456',
    username: 'demo_user',
    display_name: 'Demo User',
    access_token: 'demo_access_token',
    refresh_token: 'demo_refresh_token',
    token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
    settings: {
      theme: 'light',
      viewMode: 'grid',
      autoSync: true,
      backupEnabled: true,
      aiSuggestions: true,
    },
  };

  console.log('👤 デモユーザーを作成中...');

  const result = await query<{ id: string }>(
    `
    INSERT INTO users (
      x_user_id, username, display_name, access_token, 
      refresh_token, token_expires_at, settings
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `,
    [
      demoUser.x_user_id,
      demoUser.username,
      demoUser.display_name,
      demoUser.access_token,
      demoUser.refresh_token,
      demoUser.token_expires_at,
      JSON.stringify(demoUser.settings),
    ]
  );

  console.log(`✅ デモユーザー作成完了: ${demoUser.username} (ID: ${result.rows[0].id})`);
  return result.rows[0].id;
};

/**
 * デモブックマークの作成
 * 
 * 💡 各カテゴリにサンプルブックマークを配置して、
 * ユーザーがシステムを理解しやすくします
 */
const createDemoBookmarks = async (userId: string): Promise<void> => {
  console.log('📋 デモブックマークを作成中...');

  // ユーザーのカテゴリを取得
  const categoriesResult = await query<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE user_id = $1',
    [userId]
  );

  const categories = categoriesResult.rows.reduce(
    (acc, row) => {
      acc[row.name] = row.id;
      return acc;
    },
    {} as Record<string, string>
  );

  console.log('📁 利用可能なカテゴリ:', Object.keys(categories));

  const demoBookmarks = [
    {
      x_tweet_id: '1234567890123456789',
      content:
        'ChatGPTの新機能が発表されました！これはすごいイノベーションです。 #AI #ChatGPT #技術',
      author_username: 'openai',
      author_display_name: 'OpenAI',
      category_id: categories['技術・AI'],
      tags: ['AI', 'ChatGPT', '機械学習'],
      hashtags: ['AI', 'ChatGPT', '技術'],
      bookmarked_at: new Date('2024-01-15T10:30:00Z'),
    },
    {
      x_tweet_id: '2345678901234567890',
      content:
        '本日のおすすめレシピ：簡単チキンカレーの作り方。たった30分で絶品カレーが完成！ #料理 #レシピ',
      author_username: 'cooking_master',
      author_display_name: '料理研究家',
      category_id: categories['料理・レシピ'],
      tags: ['カレー', '簡単料理', '時短'],
      hashtags: ['料理', 'レシピ'],
      bookmarked_at: new Date('2024-01-14T18:45:00Z'),
    },
    {
      x_tweet_id: '3456789012345678901',
      content:
        '『アトミック・ハビッツ』を読み終えました。小さな習慣の積み重ねがいかに大きな変化をもたらすか、非常に参考になりました。 #読書 #習慣',
      author_username: 'book_lover',
      author_display_name: '本好き',
      category_id: categories['読書・書籍'],
      tags: ['習慣', '自己啓発', 'ビジネス書'],
      hashtags: ['読書', '習慣'],
      bookmarked_at: new Date('2024-01-13T20:15:00Z'),
    },
  ];

  // トランザクション内でブックマークを一括作成
  await withTransaction(async (client) => {
    for (const bookmark of demoBookmarks) {
      await client.query(
        `
        INSERT INTO bookmarks (
          user_id, x_tweet_id, content, author_username, author_display_name,
          category_id, tags, hashtags, bookmarked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          userId,
          bookmark.x_tweet_id,
          bookmark.content,
          bookmark.author_username,
          bookmark.author_display_name,
          bookmark.category_id,
          bookmark.tags,
          bookmark.hashtags,
          bookmark.bookmarked_at,
        ]
      );
      console.log(`  ✅ 作成完了: ${bookmark.content.substring(0, 50)}...`);
    }
  });

  console.log(`🎯 ${demoBookmarks.length}個のデモブックマークを作成しました`);
};

/**
 * メインシード実行関数
 * 
 * 💡 実行手順:
 * 1. マイグレーション状態の確認・実行
 * 2. シード実行の必要性判定
 * 3. デモユーザー作成（自動でカテゴリ作成）
 * 4. デモブックマーク作成
 */
export const seedDatabase = async (): Promise<SeedResult> => {
  console.log('🌱 データベースシード処理を開始します...');
  
  try {
    // 1. マイグレーション状態確認
    console.log('📋 マイグレーション状態を確認中...');
    const migrationResult = await migrate();

    if (!migrationResult.success) {
      return {
        success: false,
        message: 'マイグレーション実行に失敗しました',
        error: migrationResult.error,
      };
    }

    if (migrationResult.migrationsRun > 0) {
      console.log(`✅ ${migrationResult.migrationsRun}個のマイグレーションを実行しました`);
    }

    // 2. シード実行の必要性判定
    const needsSeeding = await checkSeedStatus();

    if (!needsSeeding) {
      return {
        success: true,
        message: 'データベースに既にデータが存在するため、シードをスキップしました',
      };
    }

    console.log('🎯 データベースシードを実行します...');

    // 3. デモユーザー作成（トリガーでカテゴリも自動作成）
    const userId = await createDemoUser();

    // トリガー実行の完了を待機
    console.log('⏳ デフォルトカテゴリの作成を待機中...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // カテゴリ作成の確認
    const categoryResult = await query<{ count: string }>(
      'SELECT COUNT(*) FROM categories WHERE user_id = $1',
      [userId]
    );
    console.log(`📁 ${categoryResult.rows[0].count}個のカテゴリが作成されました`);

    // 4. デモブックマーク作成
    await createDemoBookmarks(userId);

    console.log('🎉 データベースシードが正常に完了しました！');

    return {
      success: true,
      message: 'デモデータを含むデータベースシードが正常に完了しました',
    };
  } catch (error) {
    console.error('❌ シード処理中にエラーが発生しました:', error);
    return {
      success: false,
      message: 'データベースシード処理に失敗しました',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * CLI実行時のエントリーポイント
 * 
 * 💡 使用方法:
 * npm run db:seed または tsx src/database/seed.ts
 */
if (require.main === module) {
  seedDatabase()
    .then(result => {
      console.log(`\n📊 結果: ${result.message}`);
      if (result.success) {
        console.log('🎉 シード処理が正常に完了しました！');
        process.exit(0);
      } else {
        console.error('❌ エラー:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ シード実行エラー:', error);
      process.exit(1);
    })
    .finally(() => {
      // データベース接続のクリーンアップ
      import('./connection').then(({ closeDatabase }) => {
        closeDatabase().catch(console.error);
      });
    });
}
