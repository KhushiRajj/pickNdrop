const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');

const uploadRouter = require('./routes/upload');
const downloadRouter = require('./routes/download');
const { startCronJobs } = require('./services/cron');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' })); // Only JSON metadata — no file bytes
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/upload', uploadRouter);
app.use('/api/download', downloadRouter);

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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
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
