const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');

const supabase = require('../db/supabase');
const { initMultipart, signParts, completeMultipart, abortMultipart } = require('../services/s3');
const { generateQR } = require('../services/qr');

const CHUNK_SIZE = 5 * 1024 * 1024;

router.post('/init', async (req, res) => {
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
});

router.post('/sign', async (req, res) => {
  try {
    const { s3Key, uploadId, partNumbers } = req.body;
    if (!s3Key || !uploadId || !Array.isArray(partNumbers) || partNumbers.length === 0) {
      return res.status(400).json({ error: 's3Key, uploadId, and partNumbers[] are required' });
    }
    const parts = await signParts(s3Key, uploadId, partNumbers);
    res.json({ parts });
  } catch (err) {
    console.error('[UPLOAD/SIGN]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/complete', async (req, res) => {
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
      const host = req.get('host');
      if (host.includes('localhost:3001') || host.includes('127.0.0.1:3001')) {
        baseUrl = `${req.protocol}://${host.replace('3001', '5173')}`;
      } else {
        baseUrl = `${req.protocol}://${host}`;
      }
    }
    const shareUrl = `${baseUrl}/d/${token}`;
    const qrDataUrl = await generateQR(shareUrl);

    res.json({ token, shareUrl, qrDataUrl });
  } catch (err) {
    console.error('[UPLOAD/COMPLETE]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/abort', async (req, res) => {
  try {
    const { s3Key, uploadId, fileId } = req.body;
    if (s3Key && uploadId) await abortMultipart(s3Key, uploadId);
    if (fileId) await supabase.from('files').delete().eq('id', fileId);
    res.json({ success: true });
  } catch (err) {
    console.error('[UPLOAD/ABORT]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
