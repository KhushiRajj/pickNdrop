const { runCors } = require('../helper');
const supabase = require('../../../../server/src/db/supabase');

async function loadShareLink(token) {
  const { data, error } = await supabase
    .from('share_links')
    .select('*, files(*)')
    .eq('token', token)
    .single();
  if (error || !data) return null;
  return data;
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

    const link = await loadShareLink(token);
    if (!link) {
      return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    }

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
  } catch (err) {
    console.error('[DOWNLOAD/INFO]', err);
    res.status(500).json({ error: err.message });
  }
};
