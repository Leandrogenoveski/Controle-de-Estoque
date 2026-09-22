// Run once (npm run seed) to create the first ADM account.
// Safe to re-run: it does nothing if an ADM user already exists.
const crypto = require('crypto');
const { pool, query } = require('./db');
const { hashPassword } = require('./auth');

function randomPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

async function main() {
  const { rows } = await query("SELECT id FROM users WHERE role = 'ADM' LIMIT 1");
  if (rows[0]) {
    console.log('Já existe um usuário ADM cadastrado — nada a fazer.');
    return;
  }

  const username = process.env.SEED_ADMIN_USERNAME || 'leandro';
  const name = process.env.SEED_ADMIN_NAME || 'Leandro Genoveski';
  const password = process.env.SEED_ADMIN_PASSWORD || randomPassword();

  await query(
    'INSERT INTO users (id, username, password_hash, name, role, active, must_change_password, created_at, created_by) ' +
    "VALUES ($1, $2, $3, $4, 'ADM', true, true, $5, 'seed')",
    [crypto.randomUUID(), username, hashPassword(password), name, new Date().toISOString()]
  );

  console.log('Usuário ADM criado com sucesso:');
  console.log('  usuário: ' + username);
  console.log('  senha temporária: ' + password);
  console.log('Guarde essa senha em local seguro — ela será pedida para troca no primeiro login.');
}

main()
  .catch((err) => { console.error('Falha ao criar o usuário ADM:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
