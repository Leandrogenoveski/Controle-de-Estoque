// Applies supabase-schema.sql against DATABASE_URL. Safe to run more than
// once. This is an alternative to pasting the file into Supabase's SQL
// Editor -- useful for local development/testing, or for anyone who prefers
// the command line.
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'supabase-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Schema aplicado com sucesso em', process.env.DATABASE_URL || process.env.POSTGRES_URL);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao aplicar o schema:', err.message);
  process.exit(1);
});
