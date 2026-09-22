const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// In production, set JWT_SECRET as an environment variable on the host.
// Falling back to a random secret means sessions are invalidated on every
// restart, which is safe-by-default for a first deploy.
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
const COOKIE_NAME = 'estoque_session';
const TOKEN_TTL = '12h';

const ROLES = ['ADM', 'GESTOR', 'TECNICO'];

// Permission matrix, in one place so the whole app agrees on what each role can do.
const PERMISSIONS = {
  ADM: { viewAll: true, editParams: true, inputStock: true, manageCatalog: true, manageUsers: true },
  GESTOR: { viewAll: true, editParams: true, inputStock: true, manageCatalog: false, manageUsers: false },
  TECNICO: { viewAll: true, editParams: false, inputStock: false, manageCatalog: false, manageUsers: false },
};

function can(role, permission) {
  return !!(PERMISSIONS[role] && PERMISSIONS[role][permission]);
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setSessionCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// There is no login screen in this deployment: anyone who opens the link
// gets full (ADM-equivalent) access automatically. This constant is what
// readSession falls back to when there's no (or no valid) session cookie.
// The user/role management screen and its permission checks are all still
// wired up in case a login gate is reintroduced later -- they just never
// have anything to withhold today, since every request already carries
// full permissions.
const PUBLIC_USER = { id: 'public', username: 'publico', role: 'ADM' };

// Express middleware: reads the cookie, verifies it, and attaches req.user.
// Never rejects the request itself -- falls back to the public identity
// above instead of null.
function readSession(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  req.user = PUBLIC_USER;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
    } catch (e) {
      // expired or tampered token: fall back to public access
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

function requirePermission(permission) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if (!can(req.user.role, permission)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

module.exports = {
  ROLES,
  PERMISSIONS,
  PUBLIC_USER,
  can,
  hashPassword,
  verifyPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  readSession,
  requireAuth,
  requirePermission,
};
