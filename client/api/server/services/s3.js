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

const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.forcePathStyle = true;
}

const s3 = new S3Client(s3Config);

const BUCKET = process.env.S3_BUCKET_NAME;

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

async function signParts(key, uploadId, partNumbers) {
  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const cmd = new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
      return { partNumber, url };
    })
  );
  return urls;
}

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

async function abortMultipart(key, uploadId) {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
  });
  await s3.send(cmd);
}

async function getPresignedDownload(key, filename, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

async function listInProgressUploads() {
  const cmd = new ListMultipartUploadsCommand({ Bucket: BUCKET });
  const res = await s3.send(cmd);
  return res.Uploads || [];
}

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
