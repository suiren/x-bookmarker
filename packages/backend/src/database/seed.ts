import { Pool } from 'pg';
import { migrate } from './migrate';

interface SeedResult {
  success: boolean;
  message: string;
  error?: string;
}

// Database connection pool (shared with migrate.ts)
let pool: Pool;

const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'x_bookmarker',
      user: process.env.DATABASE_USER || 'x_bookmarker',
      password: process.env.DATABASE_PASSWORD || 'x_bookmarker_dev',
      ssl: process.env.DATABASE_SSL === 'true',
      max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
    });
  }
  return pool;
};

// Check if database needs seeding
const checkSeedStatus = async (): Promise<boolean> => {
  const client = getPool();

  try {
    // Check if any users exist
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    return parseInt(userCount.rows[0].count) === 0;
  } catch (error) {
    console.log('📊 Database tables not found, migrations needed');
    return true;
  }
};

// Create a demo user for development
const createDemoUser = async (): Promise<string> => {
  const client = getPool();

  const demoUser = {
    x_user_id: 'demo_user_123456',
    username: 'demo_user',
    display_name: 'Demo User',
    access_token: 'demo_access_token',
    refresh_token: 'demo_refresh_token',
    token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    settings: {
      theme: 'light',
      viewMode: 'grid',
      autoSync: true,
      backupEnabled: true,
      aiSuggestions: true,
    },
  };

  const result = await client.query(
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

  console.log('👤 Created demo user:', demoUser.username);
  return result.rows[0].id;
};

// Create demo bookmarks for the demo user
const createDemoBookmarks = async (userId: string): Promise<void> => {
  const client = getPool();

  // Get categories for the user
  const categoriesResult = await client.query(
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
  }

  console.log(`📋 Created ${demoBookmarks.length} demo bookmarks`);
};

// Main seed function
export const seedDatabase = async (): Promise<SeedResult> => {
  try {
    // First, ensure migrations are up to date
    console.log('📋 Checking migration status...');
    const migrationResult = await migrate();

    if (!migrationResult.success) {
      return {
        success: false,
        message: 'Migration failed',
        error: migrationResult.error,
      };
    }

    // Check if seeding is needed
    const needsSeeding = await checkSeedStatus();

    if (!needsSeeding) {
      return {
        success: true,
        message: 'Database already contains data, skipping seed',
      };
    }

    console.log('🌱 Starting database seeding...');

    // Create demo user (this will trigger default categories creation)
    const userId = await createDemoUser();

    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create demo bookmarks
    await createDemoBookmarks(userId);

    console.log('🎉 Database seeding completed successfully');

    return {
      success: true,
      message: 'Database seeded successfully with demo data',
    };
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return {
      success: false,
      message: 'Database seeding failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Close database connection
export const closeConnection = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
};

// CLI runner
if (require.main === module) {
  seedDatabase()
    .then(result => {
      console.log(result.message);
      if (result.success) {
        process.exit(0);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Seed error:', error);
      process.exit(1);
    });
}
