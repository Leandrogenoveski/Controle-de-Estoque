const { Pool } = require('pg');

// Connection string for the Postgres database (Supabase in production, or any
// Postgres instance locally). Supabase project settings -> Database ->
// Connection string -> "Transaction" pooler is the recommended value for a
// serverless host like Vercel (it multiplexes many short-lived function
// invocations over a small number of real Postgres connections).
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error(
    'Nenhuma variável de conexão com o banco foi definida. Configure DATABASE_URL ' +
    '(ou POSTGRES_URL) com a connection string do Postgres/Supabase antes de iniciar o servidor.'
  );
}

// Local Postgres (development/testing) has no TLS listener; anything else
// (Supabase included) requires SSL.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || 5,
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
