const { runCors } = require('../helper');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const supabase = require('../server/db/supabase');
const { completeMultipart } = require('../server/services/s3');
const { generateQR } = require('../server/services/qr');

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { s3Key, uploadId, fileId, parts, options = {} } = req.body;
    if (!s3Key || !uploadId || !fileId || !Array.isArray(parts)) {
      return res.status(400).json({ error: 's3Key, uploadId, fileId, and parts[] are required' });
    }

    await completeMultipart(s3Key, uploadId, parts);

    const { error: fileErr } = await supabase
      .from('files')
      .update({ is_complete: true, upload_id: null })
      .eq('id', fileId);
    if (fileErr) throw fileErr;

    const token = nanoid(12);
    const shareData = {
      file_id: fileId,
      token,
      password_hash: null,
      max_downloads: options.maxDownloads || null,
      expires_at: options.expiresAt || null,
      allowed_ips: options.allowedIps && options.allowedIps.length ? options.allowedIps : null,
      blocked_ips: options.blockedIps && options.blockedIps.length ? options.blockedIps : null,
    };

    if (options.password) {
      shareData.password_hash = await bcrypt.hash(options.password, 10);
    }

    const { error: linkErr } = await supabase.from('share_links').insert(shareData);
    if (linkErr) throw linkErr;

    let baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      const host = req.headers.host || req.headers['host'] || '';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      if (host.includes('localhost:3001') || host.includes('127.0.0.1:3001')) {
        baseUrl = `${protocol}://${host.replace('3001', '5173')}`;
      } else {
        baseUrl = `${protocol}://${host}`;
      }
    }
    const shareUrl = `${baseUrl}/d/${token}`;
    const qrDataUrl = await generateQR(shareUrl);

    res.json({ token, shareUrl, qrDataUrl });
  } catch (err) {
    console.error('[UPLOAD/COMPLETE]', err);
    res.status(500).json({ error: err.message });
  }
};
