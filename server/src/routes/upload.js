const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');

const supabase = require('../db/supabase');
const { initMultipart, signParts, completeMultipart, abortMultipart } = require('../services/s3');
const { generateQR } = require('../services/qr');

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

// ─── POST /api/upload/init ────────────────────────────────────────────────────
// Initiates an S3 multipart upload.
// Body: { filename, fileSize, mimeType }
// Returns: { uploadId, s3Key, totalParts }
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

    // Insert a pending file record
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

// ─── POST /api/upload/sign ────────────────────────────────────────────────────
// Returns presigned PUT URLs for given part numbers.
// Body: { s3Key, uploadId, partNumbers: [1, 2, 3, ...] }
// Returns: { parts: [{ partNumber, url }] }
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

// ─── POST /api/upload/complete ────────────────────────────────────────────────
// Completes multipart, records file, creates share link, generates QR.
// Body: {
//   s3Key, uploadId, fileId,
//   parts: [{ PartNumber, ETag }],
//   options: { password?, maxDownloads?, expiresAt?, allowedIps?, blockedIps? }
// }
// Returns: { token, shareUrl, qrDataUrl }
router.post('/complete', async (req, res) => {
  try {
    const { s3Key, uploadId, fileId, parts, options = {} } = req.body;
    if (!s3Key || !uploadId || !fileId || !Array.isArray(parts)) {
      return res.status(400).json({ error: 's3Key, uploadId, fileId, and parts[] are required' });
    }

    // 1. Complete the S3 multipart upload
    await completeMultipart(s3Key, uploadId, parts);

    // 2. Mark file as complete in DB
    const { error: fileErr } = await supabase
      .from('files')
      .update({ is_complete: true, upload_id: null })
      .eq('id', fileId);
    if (fileErr) throw fileErr;

    // 3. Build share_link row
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

    // 4. Generate QR code
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${baseUrl}/d/${token}`;
    const qrDataUrl = await generateQR(shareUrl);

    res.json({ token, shareUrl, qrDataUrl });
  } catch (err) {
    console.error('[UPLOAD/COMPLETE]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/upload/abort ───────────────────────────────────────────────────
// Aborts a multipart upload and removes the pending DB record.
// Body: { s3Key, uploadId, fileId }
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
