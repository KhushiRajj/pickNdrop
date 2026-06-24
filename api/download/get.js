const { runCors } = require('../helper');
const requestIp = require('request-ip');
const bcrypt = require('bcryptjs');
const supabase = require('../../server/src/db/supabase');
const { getPresignedDownload } = require('../../server/src/services/s3');

async function loadShareLink(token) {
  const { data, error } = await supabase
    .from('share_links')
    .select('*, files(*)')
    .eq('token', token)
    .single();
  if (error || !data) return null;
  return data;
}

async function logDownload(shareLinkId, ip, userAgent) {
  await supabase.from('download_log').insert({
    share_link_id: shareLinkId,
    ip,
    user_agent: userAgent,
  });
}

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const clientIp = requestIp.getClientIp(req) || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    const link = await loadShareLink(token);
    if (!link || !link.files) {
      return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link has expired', code: 'EXPIRED' });
    }

    if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
      return res.status(410).json({ error: 'Download limit reached', code: 'LIMIT_REACHED' });
    }

    if (link.blocked_ips && link.blocked_ips.includes(clientIp)) {
      return res.status(403).json({ error: 'Access denied', code: 'IP_BLOCKED' });
    }

    if (link.allowed_ips && link.allowed_ips.length > 0 && !link.allowed_ips.includes(clientIp)) {
      return res.status(403).json({ error: 'IP not whitelisted', code: 'IP_NOT_WHITELISTED' });
    }

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

    if (link.max_downloads !== null) {
      const { data: newCount, error: rpcErr } = await supabase.rpc('increment_download_count', {
        link_id: link.id,
        max_val: link.max_downloads,
      });

      if (rpcErr) {
        const { error: updateErr } = await supabase
          .from('share_links')
          .update({ download_count: link.download_count + 1 })
          .eq('id', link.id);
        if (updateErr) return res.status(500).json({ error: 'Internal error' });
      } else if (newCount === -1) {
        return res.status(410).json({ error: 'Download limit reached', code: 'LIMIT_REACHED' });
      }
    } else {
      await supabase
        .from('share_links')
        .update({ download_count: link.download_count + 1 })
        .eq('id', link.id);
    }

    let presignedUrl;
    try {
      presignedUrl = await getPresignedDownload(link.files.s3_key, link.files.original_name, 900);
    } catch (err) {
      console.error('[DOWNLOAD] S3 presign error:', err.message);
      return res.status(500).json({ error: 'Failed to generate download URL' });
    }

    await logDownload(link.id, clientIp, userAgent);

    res.json({
      url: presignedUrl,
      filename: link.files.original_name,
      sizeBytes: link.files.size_bytes,
      mimeType: link.files.mime_type,
    });
  } catch (err) {
    console.error('[DOWNLOAD]', err);
    res.status(500).json({ error: err.message });
  }
};
