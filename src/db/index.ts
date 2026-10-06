import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';
import * as schema from './schema';

dotenv.config({ path: '.env.local' });

// Configure WebSocket constructor for Neon interactive transactions in Node.js
neonConfig.webSocketConstructor = ws;

const rawConnectionString =
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/norsk_app';

const connectionString =
  rawConnectionString.includes('sslmode=require') && !rawConnectionString.includes('uselibpqcompat=true')
    ? rawConnectionString.replace('sslmode=require', 'sslmode=verify-full')
    : rawConnectionString;

declare global {
  // eslint-disable-next-line no-var
  var _neonPool: Pool | undefined;
}

export const pool =
  global._neonPool ||
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') {
  global._neonPool = pool;
}

export const db = drizzle(pool, { schema });
export default db;
