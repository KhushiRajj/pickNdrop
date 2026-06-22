const cron = require('node-cron');
const supabase = require('../db/supabase');
const { listInProgressUploads, abortMultipart, deleteObject } = require('./s3');

/**
 * Cron job: runs every hour.
 * 1. Aborts S3 multipart uploads that are older than 24 hours and have no complete file record in DB.
 * 2. Cleans up expired or download-limit-reached files (deletes S3 objects and deletes DB records).
 */
function startCronJobs() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running hourly cleanup jobs...');

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

    // ─── 1. Clean up stale S3 multipart uploads ───────────────────────
    try {
      const uploads = await listInProgressUploads();
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
      const { error: dbCleanErr } = await supabase
        .from('files')
        .delete()
        .eq('is_complete', false)
        .lt('created_at', cutoff.toISOString());

      if (dbCleanErr) console.error('[CRON] DB cleanup error (incomplete files):', dbCleanErr.message);
      else console.log('[CRON] Stale incomplete DB records checked/cleaned.');
    } catch (err) {
      console.error('[CRON] Error during stale multipart cleanup:', err.message);
    }

    // ─── 2. Clean up expired and spent share links ─────────────────────
    try {
      console.log('[CRON] Checking for expired or spent share links...');
      const { data: links, error: queryErr } = await supabase
        .from('share_links')
        .select('id, file_id, expires_at, max_downloads, download_count, files(s3_key)');

      if (queryErr) {
        console.error('[CRON] Error fetching share links for expiration check:', queryErr.message);
      } else if (links) {
        const expiredLinks = links.filter(link => {
          const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
          const isLimitReached = link.max_downloads !== null && link.download_count >= link.max_downloads;
          return isExpired || isLimitReached;
        });

        console.log(`[CRON] Found ${expiredLinks.length} expired or spent link(s) to remove.`);

        for (const link of expiredLinks) {
          if (link.files && link.files.s3_key) {
            console.log(`[CRON] Deleting S3 object: ${link.files.s3_key}`);
            try {
              await deleteObject(link.files.s3_key);
            } catch (s3Err) {
              console.error(`[CRON] Failed to delete S3 object ${link.files.s3_key}:`, s3Err.message);
            }
          }

          if (link.file_id) {
            console.log(`[CRON] Deleting DB file record: ${link.file_id}`);
            const { error: delErr } = await supabase
              .from('files')
              .delete()
              .eq('id', link.file_id);
            if (delErr) {
              console.error(`[CRON] Failed to delete DB file record ${link.file_id}:`, delErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[CRON] Error during expired link cleanup:', err.message);
    }
  });

  console.log('[CRON] Scheduled: hourly cleanup job (stale uploads + expired files).');
}

module.exports = { startCronJobs };
