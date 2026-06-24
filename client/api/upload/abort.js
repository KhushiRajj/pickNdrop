const { runCors } = require('../helper');
const supabase = require('../../../../server/src/db/supabase');
const { abortMultipart } = require('../../../../server/src/services/s3');

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { s3Key, uploadId, fileId } = req.body;
    if (s3Key && uploadId) await abortMultipart(s3Key, uploadId);
    if (fileId) await supabase.from('files').delete().eq('id', fileId);
    res.json({ success: true });
  } catch (err) {
    console.error('[UPLOAD/ABORT]', err);
    res.status(500).json({ error: err.message });
  }
};
