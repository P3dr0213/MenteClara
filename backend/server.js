const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { Pool } = require('pg');
const { createApp } = require('./app');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const app = createApp({ pool, jwtSecret: process.env.JWT_SECRET });
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || '127.0.0.1',
  () => {
    console.log(
      'API Mente Clara pronta na porta ' + (process.env.PORT || 3001),
    );
  },
);
async function stop() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
