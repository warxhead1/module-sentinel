import type { Config } from 'drizzle-kit';
import * as path from 'path';
import * as os from 'os';

// Determine environment and use same logic as DatabaseConfig
const env = process.env.NODE_ENV || 'development';

let dbPath: string;
if (env === 'production') {
  dbPath = process.env.PROD_DB || path.join(os.homedir(), '.module-sentinel', 'production.db');
} else if (env === 'test') {
  dbPath = process.env.TEST_DB || path.join(os.homedir(), '.module-sentinel', 'test', 'test.db');
} else {
  dbPath = process.env.DEV_DB || path.join(os.homedir(), '.module-sentinel', 'development.db');
}

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