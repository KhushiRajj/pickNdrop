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
  } catch (err) {
    console.error('[DOWNLOAD/LOG]', err);
    res.status(500).json({ error: err.message });
  }
};
