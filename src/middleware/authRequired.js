// ============================================================
// Middleware — require a valid login token on protected endpoints
// ============================================================
const { verifyToken } = require('../utils/auth');

module.exports = function authRequired(req, res, next) {
  // Look for token in "Authorization: Bearer <token>" header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No login token provided' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user info to the request so route handlers can use it
  req.user = user;
  next();
};