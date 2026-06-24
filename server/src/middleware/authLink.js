const bcrypt = require('bcryptjs');

async function authLink(req, res, next) {
  const link = req.shareLink;
  if (!link) return next();

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
