import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, pool } from '../../db/index';

export { db, pool };
export default db;

