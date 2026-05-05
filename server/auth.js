const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kanban-dev-secret';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware — protects routes that require login
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

module.exports = { signToken, verifyToken, requireAuth };