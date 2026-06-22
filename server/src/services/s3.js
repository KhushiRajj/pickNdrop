const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Initiate an S3 multipart upload.
 * Returns { uploadId, key }
 */
async function initMultipart(key, contentType) {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
    ServerSideEncryption: 'AES256',
  });
  const res = await s3.send(cmd);
  return { uploadId: res.UploadId, key };
}

/**
 * Generate presigned PUT URLs for N parts.
 * partNumbers: array of integers (1-based)
 * Returns [{ partNumber, url }]
 */
async function signParts(key, uploadId, partNumbers) {
  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const cmd = new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 }); // 1 hour
      return { partNumber, url };
    })
  );
  return urls;
}

/**
 * Complete a multipart upload.
 * parts: [{ PartNumber, ETag }]
 */
async function completeMultipart(key, uploadId, parts) {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  const res = await s3.send(cmd);
  return res.Location;
}

/**
 * Abort a multipart upload (cleanup).
 */
async function abortMultipart(key, uploadId) {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
  });
  await s3.send(cmd);
}

/**
 * Generate a presigned GET URL for a file (15 min expiry).
 */
async function getPresignedDownload(key, filename, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * List all in-progress multipart uploads (used by cron).
 */
async function listInProgressUploads() {
  const cmd = new ListMultipartUploadsCommand({ Bucket: BUCKET });
  const res = await s3.send(cmd);
  return res.Uploads || [];
}

/**
 * Delete an object from S3.
 */
async function deleteObject(key) {
  const cmd = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3.send(cmd);
}

module.exports = {
  initMultipart,
  signParts,
  completeMultipart,
  abortMultipart,
  getPresignedDownload,
  listInProgressUploads,
  deleteObject,
};
