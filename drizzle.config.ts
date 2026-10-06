import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

function getSanitizedDbUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) return '';
  // Avoid pg / pg-connection-string security warning regarding 'sslmode=require'
  if (url.includes('sslmode=require') && !url.includes('uselibpqcompat=true')) {
    return url.replace('sslmode=require', 'sslmode=verify-full');
  }
  return url;
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getSanitizedDbUrl(),
  },
});

