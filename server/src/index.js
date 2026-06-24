const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');

const uploadRouter = require('./routes/upload');
const downloadRouter = require('./routes/download');
const { startCronJobs } = require('./services/cron');

const app = express();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGIN === '*') return callback(null, true);
    const allowed = ALLOWED_ORIGIN.split(',').map(s => s.trim());
    if (allowed.includes(origin)) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.options('*', cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(['/api/upload', '/upload'], uploadRouter);
app.use(['/api/download', '/download'], downloadRouter);

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

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

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

app.use((req, res, next) => {
  console.log(`[SERVER ERROR] encountered error 404: Page not found at ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.log(`[SERVER ERROR] encountered error 500 on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[SERVER] pickNdrop API running on http://localhost:${PORT}`);
    startCronJobs();
  });
} else {
  startCronJobs();
}

module.exports = app;
