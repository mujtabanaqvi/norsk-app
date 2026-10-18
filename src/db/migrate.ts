import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables (.env.local or process.env)
dotenv.config({ path: '.env.local' });
dotenv.config();

function getDbUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) {
    throw new Error(
      'DATABASE_URL or DIRECT_DATABASE_URL environment variable is missing.'
    );
  }
  if (url.includes('sslmode=require') && !url.includes('uselibpqcompat=true')) {
    return url.replace('sslmode=require', 'sslmode=verify-full');
  }
  return url;
}

async function runMigrations() {
  const connectionString = getDbUrl();
  console.log('Running Drizzle database migrations against target database...');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    console.log(`Applying migrations from: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('✅ All database migrations applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

