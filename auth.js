const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByUsername, getUserById } = require('./db');

// ⚠️ JWT_SECRET MUST be set via environment variable in production.
// The app will refuse to start without it when NODE_ENV=production.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is required in production. Set it and restart.');
    process.exit(1);
  }
  // Dev-only fallback — never use in production
  console.warn('⚠️  Using dev JWT secret. Set JWT_SECRET env var for production.');
}

const _secret = JWT_SECRET || 'dev-only-secret-do-not-use-in-prod';
const SALT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(userId) {
  return jwt.sign({ userId }, _secret, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, _secret);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    req.user = null;
    return next();
  }
  req.user = getUserById.get(payload.userId);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  authMiddleware,
  requireAuth
};
