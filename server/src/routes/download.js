const express = require('express');
const router = express.Router();
const requestIp = require('request-ip');
const bcrypt = require('bcryptjs');

const supabase = require('../db/supabase');
const { getPresignedDownload } = require('../services/s3');

// ─── Helper: load share link + file ──────────────────────────────────────────
async function loadShareLink(token) {
  const { data, error } = await supabase
    .from('share_links')
    .select('*, files(*)')
    .eq('token', token)
    .single();
  if (error || !data) return null;
  return data;
}

// ─── Helper: write download log ───────────────────────────────────────────────
async function logDownload(shareLinkId, ip, userAgent) {
  await supabase.from('download_log').insert({
    share_link_id: shareLinkId,
    ip,
    user_agent: userAgent,
  });
}

// ─── GET /api/download/info/:token ───────────────────────────────────────────
// Public metadata — safe to expose (no secrets)
router.get('/info/:token', async (req, res) => {
  const { token } = req.params;
  const link = await loadShareLink(token);
  if (!link) return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });

  const expired = link.expires_at && new Date(link.expires_at) < new Date();
  const limitReached = link.max_downloads !== null && link.download_count >= link.max_downloads;

  res.json({
    filename: link.files?.original_name,
    sizeBytes: link.files?.size_bytes,
    mimeType: link.files?.mime_type,
    hasPassword: !!link.password_hash,
    isOneTime: link.max_downloads === 1,
    maxDownloads: link.max_downloads,
    downloadCount: link.download_count,
    expiresAt: link.expires_at,
    expired,
    limitReached,
  });
});

// ─── GET /api/download/:token ─────────────────────────────────────────────────
// Full download gate: TTL → IP → one-time → password → presigned URL
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  const clientIp = requestIp.getClientIp(req) || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || '';

  // ── 1. Load link ────────────────────────────────────────────────────────────
  const link = await loadShareLink(token);
  if (!link || !link.files) {
    return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
  }

  // ── 2. TTL check ────────────────────────────────────────────────────────────
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link has expired', code: 'EXPIRED' });
  }

  // ── 3. Download limit pre-check ─────────────────────────────────────────────
  if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
    return res.status(410).json({ error: 'Download limit reached', code: 'LIMIT_REACHED' });
  }

  // ── 4. IP blacklist ─────────────────────────────────────────────────────────
  if (link.blocked_ips && link.blocked_ips.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied', code: 'IP_BLOCKED' });
  }

  // ── 5. IP whitelist ─────────────────────────────────────────────────────────
  if (link.allowed_ips && link.allowed_ips.length > 0 && !link.allowed_ips.includes(clientIp)) {
    return res.status(403).json({ error: 'IP not whitelisted', code: 'IP_NOT_WHITELISTED' });
  }

  // ── 6. Password check ───────────────────────────────────────────────────────
  if (link.password_hash) {
    const authHeader = req.headers['authorization'] || '';
    const password = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!password) {
      return res.status(401).json({ error: 'Password required', code: 'PASSWORD_REQUIRED' });
    }
    const match = await bcrypt.compare(password, link.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password', code: 'WRONG_PASSWORD' });
    }
  }

  // ── 7. Atomic increment (one-time enforcement) ──────────────────────────────
  if (link.max_downloads !== null) {
    const { data: newCount, error: rpcErr } = await supabase.rpc('increment_download_count', {
      link_id: link.id,
      max_val: link.max_downloads,
    });

    if (rpcErr) {
      // Fallback: simple update if RPC not set up yet
      const { error: updateErr } = await supabase
        .from('share_links')
        .update({ download_count: link.download_count + 1 })
        .eq('id', link.id);
      if (updateErr) return res.status(500).json({ error: 'Internal error' });
    } else if (newCount === -1) {
      return res.status(410).json({ error: 'Download limit reached', code: 'LIMIT_REACHED' });
    }
  } else {
    // Unlimited — just increment for tracking
    await supabase
      .from('share_links')
      .update({ download_count: link.download_count + 1 })
      .eq('id', link.id);
  }

  // ── 8. Generate presigned download URL (15 min) ─────────────────────────────
  let presignedUrl;
  try {
    presignedUrl = await getPresignedDownload(link.files.s3_key, link.files.original_name, 900);
  } catch (err) {
    console.error('[DOWNLOAD] S3 presign error:', err.message);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }

  // ── 9. Audit log ────────────────────────────────────────────────────────────
  await logDownload(link.id, clientIp, userAgent);

  // ── 10. Respond ─────────────────────────────────────────────────────────────
  res.json({
    url: presignedUrl,
    filename: link.files.original_name,
    sizeBytes: link.files.size_bytes,
    mimeType: link.files.mime_type,
  });
});

// ─── POST /api/download/:token/verify ────────────────────────────────────────
// Verify password only — no download triggered
router.post('/:token/verify', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const link = await loadShareLink(token);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (!link.password_hash) return res.json({ valid: true });
  if (!password) return res.status(401).json({ error: 'Password required', code: 'PASSWORD_REQUIRED' });

  const match = await bcrypt.compare(password, link.password_hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password', code: 'WRONG_PASSWORD' });

  res.json({ valid: true });
});

// ─── GET /api/download/log/:token ────────────────────────────────────────────
// Audit log for a share token
router.get('/log/:token', async (req, res) => {
  const { token } = req.params;
  const link = await loadShareLink(token);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const { data, error } = await supabase
    .from('download_log')
    .select('*')
    .eq('share_link_id', link.id)
    .order('downloaded_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    logs: data,
    downloadCount: link.download_count,
    maxDownloads: link.max_downloads,
    expiresAt: link.expires_at,
  });
});

module.exports = router;
