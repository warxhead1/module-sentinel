import type { Config } from 'drizzle-kit';
import * as path from 'path';
import * as os from 'os';

// Determine environment
const env = process.env.NODE_ENV || 'development';
const baseDir = path.join(os.homedir(), '.module-sentinel', env);
const dbName = env === 'production' ? 'production.db' : 'development.db';
const dbPath = path.join(baseDir, dbName);

export default {
  schema: './src/database/drizzle/schema.ts',
  out: './src/database/drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath
  },
  verbose: true,
  strict: true,
  tablesFilter: ['!enhanced_symbols', '!symbol_relationships'] // Exclude old tables during migration
} satisfies Config;