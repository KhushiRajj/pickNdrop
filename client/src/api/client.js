import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// ── Upload API ────────────────────────────────────────────────────────────────

export const initUpload = (filename, fileSize, mimeType) =>
  api.post('/upload/init', { filename, fileSize, mimeType }).then(r => r.data);

export const signParts = (s3Key, uploadId, partNumbers) =>
  api.post('/upload/sign', { s3Key, uploadId, partNumbers }).then(r => r.data);

export const completeUpload = (s3Key, uploadId, fileId, parts, options = {}) =>
  api.post('/upload/complete', { s3Key, uploadId, fileId, parts, options }).then(r => r.data);

export const abortUpload = (s3Key, uploadId, fileId) =>
  api.post('/upload/abort', { s3Key, uploadId, fileId }).then(r => r.data);

// Upload a single chunk directly to S3 via presigned URL (no Vercel involved)
export const uploadChunkToS3 = async (presignedUrl, chunk, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        resolve(etag);
      } else {
        reject(new Error(`Chunk upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during chunk upload'));
    xhr.send(chunk);
  });
};

// ── Download API ──────────────────────────────────────────────────────────────

export const getLinkInfo = (token) =>
  api.get(`/download/info/${token}`).then(r => r.data);

export const downloadFile = (token, password = null) =>
  api.get(`/download/${token}`, {
    headers: password ? { Authorization: `Bearer ${password}` } : {},
  }).then(r => r.data);

export const verifyPassword = (token, password) =>
  api.post(`/download/${token}/verify`, { password }).then(r => r.data);

export const getAuditLog = (token) =>
  api.get(`/download/log/${token}`).then(r => r.data);

export default api;
