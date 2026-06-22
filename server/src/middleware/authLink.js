const bcrypt = require('bcryptjs');

/**
 * Middleware: if the share link has a password, verify the Authorization header.
 * Client sends: Authorization: Bearer <plaintext-password>
 * Expects req.shareLink to be set.
 */
async function authLink(req, res, next) {
  const link = req.shareLink;
  if (!link) return next();

  // No password set on this link
  if (!link.password_hash) return next();

  const authHeader = req.headers['authorization'] || '';
  const password = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.body?.password || '';

  if (!password) {
    return res.status(401).json({
      error: 'Password required',
      code: 'PASSWORD_REQUIRED',
    });
  }

  const match = await bcrypt.compare(password, link.password_hash);
  if (!match) {
    return res.status(401).json({
      error: 'Incorrect password',
      code: 'WRONG_PASSWORD',
    });
  }

  next();
}

module.exports = { authLink };
