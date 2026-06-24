const { runCors } = require('./helper');

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  res.json({
    status: 'server reachable',
    ts: new Date().toISOString(),
    NODE_ENV: process.env.NODE_ENV,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '(not set - defaults to *)',
    BASE_URL: process.env.BASE_URL || '(not set)',
    HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
    HAS_AWS_KEY: !!process.env.AWS_ACCESS_KEY_ID,
    request_origin: req.headers.origin || '(no origin header)',
    request_host: req.headers.host || '(no host header)',
  });
};
