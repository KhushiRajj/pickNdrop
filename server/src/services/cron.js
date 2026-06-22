const cron = require('node-cron');
const supabase = require('../db/supabase');
const { listInProgressUploads, abortMultipart } = require('./s3');

/**
 * Cron job: runs every hour.
 * Aborts S3 multipart uploads that are older than 24 hours
 * and have no corresponding complete file record in DB.
 */
function startCronJobs() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running stale multipart upload cleanup...');

    try {
      const uploads = await listInProgressUploads();
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

      for (const upload of uploads) {
        const initiated = new Date(upload.Initiated);
        if (initiated < cutoff) {
          console.log(`[CRON] Aborting stale upload: ${upload.Key} (${upload.UploadId})`);
          try {
            await abortMultipart(upload.Key, upload.UploadId);
          } catch (err) {
            console.error(`[CRON] Failed to abort ${upload.UploadId}:`, err.message);
          }
        }
      }

      // Also clean up incomplete file records older than 24h
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('is_complete', false)
        .lt('created_at', cutoff.toISOString());

      if (error) console.error('[CRON] DB cleanup error:', error.message);
      else console.log('[CRON] Stale DB records cleaned.');
    } catch (err) {
      console.error('[CRON] Error:', err.message);
    }
  });

  console.log('[CRON] Scheduled: stale upload cleanup every hour.');
}

module.exports = { startCronJobs };
