const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');

const uploadRouter = require('./routes/upload');
const downloadRouter = require('./routes/download');
const { startCronJobs } = require('./services/cron');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
// CORS: allow the configured origin(s) OR any origin when running on Vercel
// (file bytes never pass through this server — they go direct to S3 presigned URLs,
// so '*' here is safe and necessary for Vercel's serverless edge routing).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    // Wildcard — allow everything (default when env var not set)
    if (ALLOWED_ORIGIN === '*') return callback(null, true);
    // Comma-separated allow-list support (e.g. "https://a.vercel.app,http://localhost:5173")
    const allowed = ALLOWED_ORIGIN.split(',').map(s => s.trim());
    if (allowed.includes(origin)) return callback(null, true);
    // Also allow any *.vercel.app preview URL automatically
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Explicit pre-flight handler (belt-and-suspenders for Vercel edge)
app.options('*', cors());

app.use(express.json({ limit: '1mb' })); // Only JSON metadata — no file bytes
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(['/api/upload', '/upload'], uploadRouter);
app.use(['/api/download', '/download'], downloadRouter);

// Legacy /d/:token redirect (for direct browser hits)
app.get('/d/:token', (req, res) => {
  const host = req.get('host');
  let clientUrl = process.env.ALLOWED_ORIGIN;
  if (!clientUrl) {
    if (host.includes('localhost:3001') || host.includes('127.0.0.1:3001')) {
      clientUrl = `${req.protocol}://${host.replace('3001', '5173')}`;
    } else {
      clientUrl = `${req.protocol}://${host}`;
    }
  }
  res.redirect(`${clientUrl}/d/${req.params.token}`);
});

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Debug endpoint (safe - only shows masked env info)
app.get(['/api/debug', '/debug'], (req, res) => {
  res.json({
    status: 'server reachable',
    ts: new Date().toISOString(),
    NODE_ENV: process.env.NODE_ENV,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '(not set - defaults to *)',
    BASE_URL: process.env.BASE_URL || '(not set)',
    HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
    HAS_AWS_KEY: !!process.env.AWS_ACCESS_KEY_ID,
    request_origin: req.get('origin') || '(no origin header)',
    request_host: req.get('host'),
  });
});

// 404 fallback for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[SERVER] pickNdrop API running on http://localhost:${PORT}`);
    startCronJobs();
  });
} else {
  // Vercel: cron doesn't run in serverless — use Vercel Cron or Supabase pg_cron
  startCronJobs();
}

module.exports = app; // exported for Vercel
