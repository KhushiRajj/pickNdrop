const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

function runCors(req, res) {
  let origin = req.headers.origin || '*';
  if (ALLOWED_ORIGIN !== '*') {
    const allowed = ALLOWED_ORIGIN.split(',').map(s => s.trim());
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      // Accept origin
    } else {
      origin = allowed[0] || '*';
    }
  }

  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // handled
  }
  return false; // not handled
}

module.exports = { runCors };
