const { runCors } = require('../helper');
const { signParts } = require('../../server/src/services/s3');

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
};
