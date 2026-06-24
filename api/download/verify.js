const { runCors } = require('../helper');
const bcrypt = require('bcryptjs');
const supabase = require('../../server/src/db/supabase');

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token } = req.query;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const link = await loadShareLink(token);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (!link.password_hash) return res.json({ valid: true });
    if (!password) {
      return res.status(401).json({ error: 'Password required', code: 'PASSWORD_REQUIRED' });
    }

    const match = await bcrypt.compare(password, link.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password', code: 'WRONG_PASSWORD' });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('[DOWNLOAD/VERIFY]', err);
    res.status(500).json({ error: err.message });
  }
};
