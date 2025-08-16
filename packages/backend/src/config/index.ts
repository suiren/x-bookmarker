/**
 * アプリケーション設定管理
 * 
 * 環境変数を型安全に管理し、デフォルト値を提供します。
 * 💡 設定の中央管理により、環境による差異を明確にし、
 * 型安全性を確保できます。
 */

import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

/**
 * 設定の型定義
 */
interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    maxConnections?: number;
    minConnections?: number;
    database?: string;
    username?: string;
    ssl?: boolean | object;
  };
  
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    environment?: string;
  };
  
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  x: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  
  ai: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
  };
}

/**
 * 環境変数から設定を読み込み
 */
function createConfig(): Config {
  return {
    env: (process.env.NODE_ENV as Config['env']) || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME || 'x_bookmarker',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    },
    
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    
    jwt: {
      secret: process.env.JWT_SECRET || 'your-jwt-secret-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    
    x: {
      clientId: process.env.X_CLIENT_ID || '',
      clientSecret: process.env.X_CLIENT_SECRET || '',
      callbackUrl: process.env.X_CALLBACK_URL || 'http://localhost:3000/auth/x/callback',
    },
    
    ai: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
  };
}

/**
 * 設定の検証
 */
function validateConfig(config: Config): void {
  const requiredFields = [
    'database.host',
    'database.name', 
    'database.user',
    'database.password',
  ];
  
  for (const field of requiredFields) {
    const value = field.split('.').reduce((obj, key) => obj?.[key], config as any);
    if (!value) {
      throw new Error(`必須の設定項目が不足しています: ${field}`);
    }
  }
  
  if (config.env === 'production') {
    if (config.jwt.secret === 'your-jwt-secret-key') {
      throw new Error('本番環境ではJWT_SECRETを設定してください');
    }
  }
}

// 設定の作成と検証
export const config = createConfig();

// 開発環境でのみ設定検証をスキップ（env.exampleの設定値でも動作するため）
if (config.env !== 'development') {
  validateConfig(config);
}

// 設定の出力（機密情報を除く）
if (config.env === 'development') {
  console.log('📋 現在の設定:');
  console.log(`  環境: ${config.env}`);
  console.log(`  ポート: ${config.port}`);
  console.log(`  データベース: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`  Redis: ${config.redis.host}:${config.redis.port}`);
}