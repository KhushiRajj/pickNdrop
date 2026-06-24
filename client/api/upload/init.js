const { runCors } = require('../helper');
const { nanoid } = require('nanoid');
const supabase = require('../../../../server/src/db/supabase');
const { initMultipart } = require('../../../../server/src/services/s3');

const CHUNK_SIZE = 5 * 1024 * 1024;

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { filename, fileSize, mimeType } = req.body;
    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'filename and fileSize are required' });
    }

    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const s3Key = `uploads/${Date.now()}-${nanoid(8)}${ext ? '.' + ext : ''}`;
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE);

    const { uploadId } = await initMultipart(s3Key, mimeType);

    const { data, error } = await supabase.from('files').insert({
      original_name: filename,
      s3_key: s3Key,
      size_bytes: fileSize,
      mime_type: mimeType || 'application/octet-stream',
      upload_id: uploadId,
      is_complete: false,
    }).select().single();

    if (error) throw error;

    res.json({ uploadId, s3Key, totalParts, fileId: data.id });
  } catch (err) {
    console.error('[UPLOAD/INIT]', err);
    res.status(500).json({ error: err.message });
  }
};
