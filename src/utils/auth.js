// ============================================================
// Auth utilities — password hashing + JWT tokens
// ============================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '7d'; // Login lasts 7 days before user must re-authenticate

// Hash a plain-text password (used when creating/updating users)
async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

// Check if a plain-text password matches a stored hash (used at login)
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Create a signed JWT token for a logged-in user
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      region: user.region,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Verify a token (used on protected endpoints)
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, createToken, verifyToken };