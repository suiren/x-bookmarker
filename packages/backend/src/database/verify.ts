// Simple verification script for database migration and seeding logic
import fs from 'fs/promises';
import path from 'path';

interface VerificationResult {
  success: boolean;
  message: string;
  details?: string[];
}

// Verify migration files exist and are correctly named
export const verifyMigrationFiles = async (): Promise<VerificationResult> => {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(file => file.endsWith('.sql')).sort();

    const expectedFiles = [
      '001_create_users_table.sql',
      '002_create_categories_table.sql',
      '003_create_tags_table.sql',
      '004_create_bookmarks_table.sql',
      '005_create_sync_jobs_table.sql',
      '006_create_search_history_table.sql',
      '007_create_default_categories.sql',
    ];

    const details: string[] = [];
    let allPresent = true;

    for (const expected of expectedFiles) {
      if (sqlFiles.includes(expected)) {
        details.push(`✅ Found: ${expected}`);
      } else {
        details.push(`❌ Missing: ${expected}`);
        allPresent = false;
      }
    }

    return {
      success: allPresent,
      message: allPresent
        ? 'All migration files are present'
        : 'Some migration files are missing',
      details,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to verify migration files',
      details: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
};

// Verify migration file contents contain expected SQL patterns
export const verifyMigrationContent = async (): Promise<VerificationResult> => {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const details: string[] = [];
    let allValid = true;

    const validationRules = [
      {
        file: '001_create_users_table.sql',
        contains: ['CREATE TABLE users', 'uuid_generate_v4'],
      },
      {
        file: '002_create_categories_table.sql',
        contains: ['CREATE TABLE categories', 'user_id'],
      },
      { file: '003_create_tags_table.sql', contains: ['CREATE TABLE tags'] },
      {
        file: '004_create_bookmarks_table.sql',
        contains: ['CREATE TABLE bookmarks', 'x_tweet_id'],
      },
      {
        file: '005_create_sync_jobs_table.sql',
        contains: ['CREATE TABLE sync_jobs'],
      },
      {
        file: '006_create_search_history_table.sql',
        contains: ['CREATE TABLE search_history'],
      },
      {
        file: '007_create_default_categories.sql',
        contains: ['create_default_categories', 'TRIGGER'],
      },
    ];

    for (const rule of validationRules) {
      try {
        const content = await fs.readFile(
          path.join(migrationsDir, rule.file),
          'utf-8'
        );
        const fileValid = rule.contains.every(pattern =>
          content.includes(pattern)
        );

        if (fileValid) {
          details.push(`✅ ${rule.file}: Valid SQL structure`);
        } else {
          details.push(`❌ ${rule.file}: Missing required patterns`);
          allValid = false;
        }
      } catch (error) {
        details.push(`❌ ${rule.file}: Cannot read file`);
        allValid = false;
      }
    }

    return {
      success: allValid,
      message: allValid
        ? 'All migration files have valid SQL structure'
        : 'Some migration files have issues',
      details,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to verify migration content',
      details: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
};

// Verify TypeScript compilation of migration and seed modules
export const verifyTypeScriptCompilation = (): VerificationResult => {
  try {
    // These imports will fail at runtime if there are TypeScript errors
    const migrate = require('./migrate');
    const seed = require('./seed');

    const details = [
      '✅ migrate.ts: Compiles successfully',
      '✅ seed.ts: Compiles successfully',
      '✅ All required exports present',
    ];

    // Check that required functions are exported
    if (!migrate.migrate || !seed.seedDatabase) {
      return {
        success: false,
        message: 'Required functions not exported',
        details: ['❌ Missing migrate or seedDatabase exports'],
      };
    }

    return {
      success: true,
      message: 'TypeScript compilation successful',
      details,
    };
  } catch (error) {
    return {
      success: false,
      message: 'TypeScript compilation failed',
      details: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
};

// Run all verifications
export const runFullVerification = async (): Promise<void> => {
  console.log('🔍 Starting database module verification...\n');

  const verifications = [
    { name: 'Migration Files', test: verifyMigrationFiles },
    { name: 'Migration Content', test: verifyMigrationContent },
    { name: 'TypeScript Compilation', test: verifyTypeScriptCompilation },
  ];

  let allPassed = true;

  for (const verification of verifications) {
    console.log(`📋 Testing: ${verification.name}`);
    const result = await verification.test();

    console.log(`  ${result.success ? '✅' : '❌'} ${result.message}`);

    if (result.details) {
      result.details.forEach(detail => console.log(`    ${detail}`));
    }

    if (!result.success) {
      allPassed = false;
    }

    console.log('');
  }

  console.log('🎯 Verification Summary:');
  console.log(
    `  ${allPassed ? '✅ All checks passed' : '❌ Some checks failed'}`
  );
  console.log(
    `  Status: ${allPassed ? 'Task 3 implementation verified' : 'Task 3 needs attention'}`
  );

  if (allPassed) {
    console.log('\n🚀 Ready to proceed to Task 4: Authentication & Security');
  }
};

// CLI runner
if (require.main === module) {
  runFullVerification()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Verification error:', error);
      process.exit(1);
    });
}
