const express = require('express');
const crypto = require('crypto');
const { query } = require('./db');
const {
  hashPassword, verifyPassword, setSessionCookie, clearSessionCookie,
  requireAuth, requirePermission, can, PERMISSIONS, ROLES, PUBLIC_USER,
} = require('./auth');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

function publicUser(u) {
  return {
    id: u.id, username: u.username, name: u.name, role: u.role,
    active: !!u.active, mustChangePassword: !!u.must_change_password,
    createdAt: u.created_at,
  };
}

function randomPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

// Small helpers around `query` so route handlers read like the previous
// synchronous (better-sqlite3) code, but async.
async function one(sql, params) {
  const { rows } = await query(sql, params);
  return rows[0];
}
async function all(sql, params) {
  const { rows } = await query(sql, params);
  return rows;
}
async function run(sql, params) {
  return query(sql, params);
}

function asyncRoute(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// ---------------- auth ----------------

router.post('/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  const u = await one('SELECT * FROM users WHERE username = $1', [String(username).trim().toLowerCase()]);
  if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  setSessionCookie(res, u);
  res.json({ user: publicUser(u), permissions: PERMISSIONS[u.role] });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  // No login gate in this deployment: everyone is the public identity
  // unless a real session cookie says otherwise (kept for forward
  // compatibility, but nothing sets that cookie today).
  if (req.user.id === PUBLIC_USER.id) {
    return res.json({
      user: {
        id: PUBLIC_USER.id, username: PUBLIC_USER.username, name: 'Acesso Wap',
        role: PUBLIC_USER.role, active: true, mustChangePassword: false, createdAt: null,
      },
      permissions: PERMISSIONS[PUBLIC_USER.role],
    });
  }
  const u = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!u || !u.active) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ user: publicUser(u), permissions: PERMISSIONS[u.role] });
}));

router.post('/change-password', requireAuth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'weak_password', message: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }
  const u = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!u) return res.status(401).json({ error: 'not_authenticated' });
  if (!u.must_change_password) {
    if (!currentPassword || !verifyPassword(currentPassword, u.password_hash)) {
      return res.status(401).json({ error: 'invalid_current_password' });
    }
  }
  await run('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hashPassword(newPassword), u.id]);
  res.json({ ok: true });
}));

// ---------------- units ----------------

router.get('/units', requireAuth, asyncRoute(async (req, res) => {
  res.json(await all('SELECT id, label FROM units ORDER BY sort_order'));
}));

// ---------------- users (ADM only) ----------------

router.get('/users', requirePermission('manageUsers'), asyncRoute(async (req, res) => {
  res.json((await all('SELECT * FROM users ORDER BY created_at')).map(publicUser));
}));

router.post('/users', requirePermission('manageUsers'), asyncRoute(async (req, res) => {
  const { username, name, role } = req.body || {};
  if (!username || !name || !role) return res.status(400).json({ error: 'missing_fields' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
  const uname = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(uname)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Use apenas letras minúsculas, números, ponto, traço ou underline (3 a 40 caracteres).' });
  }
  const exists = await one('SELECT id FROM users WHERE username = $1', [uname]);
  if (exists) return res.status(409).json({ error: 'username_taken', message: 'Já existe um usuário com esse nome de acesso.' });

  const tempPassword = randomPassword();
  const id = crypto.randomUUID();
  await run(
    'INSERT INTO users (id, username, password_hash, name, role, active, must_change_password, created_at, created_by) ' +
    'VALUES ($1, $2, $3, $4, $5, true, true, $6, $7)',
    [id, uname, hashPassword(tempPassword), String(name).trim(), role, nowIso(), req.user.id]
  );

  const u = await one('SELECT * FROM users WHERE id = $1', [id]);
  res.status(201).json({ user: publicUser(u), tempPassword });
}));

router.patch('/users/:id', requirePermission('manageUsers'), asyncRoute(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const { role, active, name } = req.body || {};
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
  if (role !== undefined && u.role === 'ADM' && role !== 'ADM') {
    const row = await one("SELECT COUNT(*) AS n FROM users WHERE role = 'ADM' AND id != $1", [u.id]);
    if (Number(row.n) === 0) return res.status(400).json({ error: 'last_admin', message: 'Precisa existir pelo menos um usuário ADM.' });
  }
  if (active === false && u.id === req.user.id) {
    return res.status(400).json({ error: 'cannot_deactivate_self' });
  }
  const next = {
    role: role !== undefined ? role : u.role,
    active: active !== undefined ? !!active : u.active,
    name: name !== undefined ? String(name).trim() : u.name,
  };
  await run('UPDATE users SET role = $1, active = $2, name = $3 WHERE id = $4', [next.role, next.active, next.name, u.id]);
  res.json({ user: publicUser(await one('SELECT * FROM users WHERE id = $1', [u.id])) });
}));

router.post('/users/:id/reset-password', requirePermission('manageUsers'), asyncRoute(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const tempPassword = randomPassword();
  await run('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [hashPassword(tempPassword), u.id]);
  res.json({ tempPassword });
}));

// ---------------- products ----------------

router.get('/products', requireAuth, asyncRoute(async (req, res) => {
  const unit = req.query.unit;
  if (!unit) return res.status(400).json({ error: 'missing_unit' });
  const rows = await all('SELECT * FROM products WHERE unit_id = $1 ORDER BY code', [unit]);
  res.json(rows.map((p) => ({
    code: p.code, name: p.name, category: p.category, unit: p.unit_label,
    minStock: p.min_stock, avgConsumption: p.avg_consumption,
  })));
}));

router.post('/products', requirePermission('manageCatalog'), asyncRoute(async (req, res) => {
  const { unit, code, name, category, unitLabel, minStock, avgConsumption } = req.body || {};
  if (!unit || !code || !name || !category) return res.status(400).json({ error: 'missing_fields' });
  const rawCode = String(code).trim().toUpperCase();
  if (!/^[A-Za-z0-9_\-.~:@+]+$/.test(rawCode)) return res.status(400).json({ error: 'invalid_code' });
  const exists = await one('SELECT id FROM products WHERE unit_id = $1 AND code = $2', [unit, rawCode]);
  if (exists) return res.status(409).json({ error: 'code_taken', message: 'Já existe um item com esse código nesta unidade.' });
  const min = Number(minStock) || 0;
  const avg = Number(avgConsumption) || 0;
  const ts = nowIso();
  await run(
    'INSERT INTO products (id, unit_id, code, name, category, unit_label, min_stock, avg_consumption, created_at, updated_at) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [crypto.randomUUID(), unit, rawCode, String(name).trim(), String(category).trim(), unitLabel || '', min, avg, ts, ts]
  );

  await logActivity(unit, 'add', rawCode, String(name).trim(), category, req.user.id);
  res.status(201).json({ ok: true });
}));

router.patch('/products/:unit/:code', requirePermission('editParams'), asyncRoute(async (req, res) => {
  const { unit, code } = req.params;
  const row = await one('SELECT * FROM products WHERE unit_id = $1 AND code = $2', [unit, code]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const { minStock, avgConsumption } = req.body || {};
  const next = {
    min_stock: minStock !== undefined ? Number(minStock) : row.min_stock,
    avg_consumption: avgConsumption !== undefined ? Number(avgConsumption) : row.avg_consumption,
  };
  await run('UPDATE products SET min_stock = $1, avg_consumption = $2, updated_at = $3 WHERE id = $4', [next.min_stock, next.avg_consumption, nowIso(), row.id]);
  res.json({ ok: true });
}));

// ---------------- counts ----------------

router.get('/counts', requireAuth, asyncRoute(async (req, res) => {
  const { unit, month } = req.query;
  if (!unit || !month) return res.status(400).json({ error: 'missing_fields' });
  const rows = await all('SELECT * FROM counts WHERE unit_id = $1 AND month = $2', [unit, month]);
  const map = {};
  rows.forEach((r) => { map[r.code] = { code: r.code, month: r.month, qty: r.qty, updatedAt: r.updated_at }; });
  res.json(map);
}));

router.get('/counts/history', requireAuth, asyncRoute(async (req, res) => {
  const { unit, code } = req.query;
  const limit = Math.min(Number(req.query.limit) || 7, 24);
  if (!unit || !code) return res.status(400).json({ error: 'missing_fields' });
  const rows = await all('SELECT month, qty FROM counts WHERE unit_id = $1 AND code = $2 ORDER BY month DESC LIMIT $3', [unit, code, limit]);
  res.json(rows);
}));

router.put('/counts/:unit/:code/:month', requirePermission('inputStock'), asyncRoute(async (req, res) => {
  const { unit, code, month } = req.params;
  const { qty } = req.body || {};
  const n = qty === null || qty === '' || qty === undefined ? null : Number(qty);
  if (n !== null && Number.isNaN(n)) return res.status(400).json({ error: 'invalid_qty' });
  const product = await one('SELECT * FROM products WHERE unit_id = $1 AND code = $2', [unit, code]);
  if (!product) return res.status(404).json({ error: 'product_not_found' });
  const ts = nowIso();
  await run(
    'INSERT INTO counts (id, unit_id, code, month, qty, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ' +
    'ON CONFLICT (unit_id, code, month) DO UPDATE SET qty = EXCLUDED.qty, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by',
    [crypto.randomUUID(), unit, code, month, n, ts, req.user.id]
  );

  if (n !== null) await logActivity(unit, 'count', code, product.name, String(n), req.user.id, month);
  res.json({ ok: true });
}));

// ---------------- activity ----------------

async function logActivity(unitId, type, code, name, detail, actorId, month) {
  await run(
    'INSERT INTO activity (id, unit_id, type, code, name, detail, month, actor_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [crypto.randomUUID(), unitId, type, code || null, name || null, detail || '', month || null, actorId || null, nowIso()]
  );
  // keep the log bounded per unit
  const cap = 200;
  const countRow = await one('SELECT COUNT(*) AS n FROM activity WHERE unit_id = $1', [unitId]);
  const count = Number(countRow.n);
  if (count > cap) {
    const excess = count - cap;
    await run(
      'DELETE FROM activity WHERE id IN (SELECT id FROM activity WHERE unit_id = $1 ORDER BY created_at ASC LIMIT $2)',
      [unitId, excess]
    );
  }
}

router.get('/activity', requireAuth, asyncRoute(async (req, res) => {
  const { unit } = req.query;
  const limit = Math.min(Number(req.query.limit) || 8, 100);
  if (!unit) return res.status(400).json({ error: 'missing_unit' });
  const rows = await all('SELECT * FROM activity WHERE unit_id = $1 ORDER BY created_at DESC LIMIT $2', [unit, limit]);
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));
  const names = {};
  if (actorIds.length) {
    const placeholders = actorIds.map((_, i) => `$${i + 1}`).join(',');
    (await all(`SELECT id, name FROM users WHERE id IN (${placeholders})`, actorIds))
      .forEach((u) => { names[u.id] = u.name; });
  }
  res.json(rows.map((r) => ({
    id: r.id, type: r.type, code: r.code, name: r.name, detail: r.detail,
    unitId: r.unit_id, month: r.month,
    actorName: r.actor_id ? (names[r.actor_id] || 'Alguém') : 'Alguém',
    createdAt: r.created_at,
  })));
}));

// ---------------- purchase order ----------------

router.get('/purchase-order', requireAuth, asyncRoute(async (req, res) => {
  const { unit, month } = req.query;
  if (!unit || !month) return res.status(400).json({ error: 'missing_fields' });
  const products = await all('SELECT * FROM products WHERE unit_id = $1 ORDER BY code', [unit]);
  const counts = {};
  (await all('SELECT * FROM counts WHERE unit_id = $1 AND month = $2', [unit, month]))
    .forEach((c) => { counts[c.code] = c; });

  const rows = [];
  const skipped = [];
  products.forEach((p) => {
    const c = counts[p.code];
    const min = p.min_stock || 0;
    if (!c || c.qty == null) {
      if (min > 0) skipped.push({ code: p.code, name: p.name });
      return;
    }
    const need = min - c.qty;
    if (need > 0) {
      rows.push({
        code: p.code, name: p.name, category: p.category, unit: p.unit_label || '',
        qty: c.qty, min, order: need,
      });
    }
  });
  res.json({ rows, skipped });
}));

module.exports = router;
