const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByUsername, getUserById } = require('./db');
const JWT_SECRET = process.env.JWT_SECRET || 'osero-secret-change-in-prod';
const SALT_ROUNDS = 10;
function hashPassword(password) {
return bcrypt.hashSync(password, SALT_ROUNDS);
}
function verifyPassword(password, hash) {
return bcrypt.compareSync(password, hash);
}
function generateToken(userId) {
return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
try {
return jwt.verify(token, JWT_SECRET);
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