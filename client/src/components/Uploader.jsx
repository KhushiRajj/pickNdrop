import { useState, useCallback, useRef, useEffect } from 'react';
import { initUpload, signParts, uploadChunkToS3, completeUpload, abortUpload } from '../api/client';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export default function Uploader({ onComplete }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const [chunkProgress, setChunkProgress] = useState([]); // per-chunk %
  const [error, setError] = useState('');
  const [options, setOptions] = useState({
    password: '',
    maxDownloads: '',
    expiresAt: '',
    allowedIps: '',
    blockedIps: '',
  });
  const [showOptions, setShowOptions] = useState(false);
  const abortRef = useRef(false);
  const uploadStateRef = useRef(null);
  const [resumeSession, setResumeSession] = useState(null);

  const sessionKey = file ? `pickndrop-upload-${file.name}-${file.size}-${file.lastModified}` : '';

  // Check for resume session when file changes
  useEffect(() => {
    if (file) {
      const saved = localStorage.getItem(sessionKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.uploadId && parsed.s3Key && parsed.fileId && Array.isArray(parsed.completedParts)) {
            setResumeSession(parsed);
            return;
          }
        } catch (_) {
          localStorage.removeItem(sessionKey);
        }
      }
    }
    setResumeSession(null);
  }, [file, sessionKey]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setError(''); }
  }, []);

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); setError(''); }
  };

  const formatBytes = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  };

  const startUpload = async (isResume = false) => {
    if (!file) return;
    setError('');
    setUploading(true);
    abortRef.current = false;

    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    let uploadState = null;
    let completedParts = [];
    let completedPartNums = new Set();

    if (isResume && resumeSession) {
      uploadState = {
        uploadId: resumeSession.uploadId,
        s3Key: resumeSession.s3Key,
        fileId: resumeSession.fileId,
      };
      completedParts = [...resumeSession.completedParts];
      completedPartNums = new Set(completedParts.map(p => p.PartNumber));

      const initialChunkProgress = Array.from({ length: totalParts }, (_, i) =>
        completedPartNums.has(i + 1) ? 100 : 0
      );
      setChunkProgress(initialChunkProgress);
      const initialProgress = Math.round((completedParts.length / totalParts) * 100);
      setProgress(initialProgress);
    } else {
      localStorage.removeItem(sessionKey);
      setChunkProgress(new Array(totalParts).fill(0));
      setProgress(0);
    }

    uploadStateRef.current = uploadState;

    try {
      if (!uploadState) {
        // ── Step 1: Init multipart ──────────────────────────────────────────────
        const { uploadId, s3Key, fileId } = await initUpload(file.name, file.size, file.type);
        uploadState = { uploadId, s3Key, fileId };
        uploadStateRef.current = uploadState;

        localStorage.setItem(sessionKey, JSON.stringify({
          uploadId,
          s3Key,
          fileId,
          completedParts: [],
        }));
      }

      const { uploadId, s3Key, fileId } = uploadState;

      // ── Step 2: Sign all part URLs ─────────────────────────────────────────
      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      const { parts: signedParts } = await signParts(s3Key, uploadId, partNumbers);

      // ── Step 3: Upload each chunk directly to S3 ───────────────────────────
      let totalUploaded = completedParts.length * CHUNK_SIZE;

      for (let i = 0; i < totalParts; i++) {
        if (abortRef.current) throw new Error('Upload cancelled');

        if (completedPartNums.has(i + 1)) {
          continue;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const { url } = signedParts[i];

        const etag = await uploadChunkToS3(url, chunk, (loaded) => {
          const chunkLoaded = loaded;
          setChunkProgress(prev => {
            const copy = [...prev];
            copy[i] = Math.round((loaded / (end - start)) * 100);
            return copy;
          });
          setProgress(Math.round(((totalUploaded + chunkLoaded) / file.size) * 100));
        });

        totalUploaded += (end - start);
        completedParts.push({ PartNumber: i + 1, ETag: etag });

        localStorage.setItem(sessionKey, JSON.stringify({
          uploadId,
          s3Key,
          fileId,
          completedParts,
        }));

        setProgress(Math.round((totalUploaded / file.size) * 100));
        setChunkProgress(prev => {
          const copy = [...prev];
          copy[i] = 100;
          return copy;
        });
      }

      // ── Step 4: Complete upload ────────────────────────────────────────────
      const parsedOptions = {
        password: options.password || undefined,
        maxDownloads: options.maxDownloads ? parseInt(options.maxDownloads) : undefined,
        expiresAt: options.expiresAt || undefined,
        allowedIps: options.allowedIps
          ? options.allowedIps.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        blockedIps: options.blockedIps
          ? options.blockedIps.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      };

      const result = await completeUpload(s3Key, uploadId, fileId, completedParts, parsedOptions);
      
      localStorage.removeItem(sessionKey);
      setResumeSession(null);
      setUploading(false);
      onComplete(result, options); // pass raw options for SharePanel badges
    } catch (err) {
      setUploading(false);
      if (abortRef.current) {
        setError('Upload cancelled.');
        localStorage.removeItem(sessionKey);
        setResumeSession(null);
        if (uploadState) {
          try { await abortUpload(uploadState.s3Key, uploadState.uploadId, uploadState.fileId); } catch (_) {}
        }
      } else {
        setError(err.message || 'Upload failed');
      }
    }
  };

  const cancelUpload = async () => {
    abortRef.current = true;
    setUploading(false);
    setProgress(0);
    localStorage.removeItem(sessionKey);
    setResumeSession(null);
    const state = uploadStateRef.current;
    if (state) {
      try { await abortUpload(state.s3Key, state.uploadId, state.fileId); } catch (_) {}
      uploadStateRef.current = null;
    }
  };

  return (
    <div className="uploader">
      {/* Drop Zone */}
      <div
        className={`drop-zone ${dragging ? 'drop-zone--active' : ''} ${file ? 'drop-zone--has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {!file ? (
          <div className="drop-zone__empty">
            <div className="drop-zone__icon">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="drop-zone__title">Drop your file here</p>
            <p className="drop-zone__sub">or click to browse · Any file type · No size limit</p>
          </div>
        ) : (
          <div className="drop-zone__file">
            <div className="file-icon">{getFileEmoji(file.name)}</div>
            <div className="file-meta">
              <p className="file-name">{file.name}</p>
              <p className="file-size">{formatBytes(file.size)}</p>
            </div>
            {!uploading && (
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0); }}
              >✕</button>
            )}
          </div>
        )}
      </div>

      {/* Options Toggle */}
      {file && !uploading && (
        <button className="btn-text" onClick={() => setShowOptions(v => !v)}>
          <span>{showOptions ? '▲' : '▼'}</span>
          {showOptions ? 'Hide options' : 'Security & expiry options'}
        </button>
      )}

      {/* Options Panel */}
      {showOptions && file && !uploading && (
        <div className="options-panel">
          <div className="options-grid">
            <div className="field">
              <label className="field__label">🔒 Password</label>
              <input
                className="field__input"
                type="password"
                placeholder="Leave blank for no password"
                value={options.password}
                onChange={e => setOptions(o => ({ ...o, password: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field__label">⬇ Max downloads</label>
              <input
                className="field__input"
                type="number"
                min="1"
                placeholder="Unlimited"
                value={options.maxDownloads}
                onChange={e => setOptions(o => ({ ...o, maxDownloads: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field__label">⏰ Expires at</label>
              <input
                className="field__input"
                type="datetime-local"
                value={options.expiresAt}
                onChange={e => setOptions(o => ({ ...o, expiresAt: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field__label">✅ Allowed IPs <span className="field__hint">(comma-separated)</span></label>
              <input
                className="field__input"
                type="text"
                placeholder="e.g. 192.168.1.1, 10.0.0.2"
                value={options.allowedIps}
                onChange={e => setOptions(o => ({ ...o, allowedIps: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field__label">🚫 Blocked IPs <span className="field__hint">(comma-separated)</span></label>
              <input
                className="field__input"
                type="text"
                placeholder="e.g. 1.2.3.4"
                value={options.blockedIps}
                onChange={e => setOptions(o => ({ ...o, blockedIps: e.target.value }))}
              />
            </div>
          </div>
          <div className="ttl-presets">
            <span className="field__label">Quick expiry:</span>
            {[
              { label: '1 hour', hours: 1 },
              { label: '24 hours', hours: 24 },
              { label: '7 days', hours: 168 },
            ].map(({ label, hours }) => (
              <button
                key={hours}
                className="btn-preset"
                onClick={() => {
                  const d = new Date(Date.now() + hours * 3600 * 1000);
                  setOptions(o => ({ ...o, expiresAt: d.toISOString().slice(0, 16) }));
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress}% uploaded</span>
            <button className="btn-cancel" onClick={cancelUpload}>Cancel</button>
          </div>
          <div className="chunk-grid">
            {chunkProgress.map((p, i) => (
              <div key={i} className={`chunk-dot ${p === 100 ? 'chunk-dot--done' : p > 0 ? 'chunk-dot--active' : ''}`} title={`Part ${i + 1}: ${p}%`} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="error-msg">{error}</p>}

      {/* Upload Button */}
      {file && !uploading && (
        resumeSession ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button className="btn-upload" onClick={() => startUpload(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Resume Upload ({Math.round((resumeSession.completedParts.length / Math.ceil(file.size / CHUNK_SIZE)) * 100)}% done)
            </button>
            <button className="btn-text" style={{ alignSelf: 'center', marginTop: 0 }} onClick={() => startUpload(false)}>
              Or start clean (ignores previous progress)
            </button>
          </div>
        ) : (
          <button className="btn-upload" onClick={() => startUpload(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload & Generate Link
          </button>
        )
      )}
    </div>
  );
}

function getFileEmoji(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📑', pptx: '📑', zip: '🗜', rar: '🗜', '7z': '🗜',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
    js: '📜', ts: '📜', jsx: '📜', tsx: '📜', py: '🐍',
    json: '📋', xml: '📋', csv: '📋',
    exe: '⚙️', dmg: '⚙️', apk: '⚙️',
  };
  return map[ext] || '📁';
}
