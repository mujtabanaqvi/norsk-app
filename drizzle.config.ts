import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/norsk_app',
} satisfies Config;

