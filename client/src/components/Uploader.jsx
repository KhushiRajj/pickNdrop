import { useState, useCallback, useRef, useEffect } from 'react';
import { initUpload, signParts, uploadChunkToS3, completeUpload, abortUpload } from '../api/client';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

const TEMPLATES = [
  { id: 't1', name: 'youtube_intro_template.prproj', size: 8.5 * 1024 * 1024, label: 'YouTube Intro', desc: 'Modern intro with text overlays', type: 'application/octet-stream', bg: 'linear-gradient(135deg, #f43f5e, #be123c)' },
  { id: 't2', name: 'tiktok_slideshow.aep', size: 4.2 * 1024 * 1024, label: 'TikTok Slideshow', desc: 'Fast-paced edits with transitions', type: 'application/octet-stream', bg: 'linear-gradient(135deg, #a855f7, #6b21a8)' },
  { id: 't3', name: 'corporate_presentation.key', size: 15.6 * 1024 * 1024, label: 'Corporate Promo', desc: 'Clean layouts and chart diagrams', type: 'application/octet-stream', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' },
];

export default function Uploader({ onComplete, isDark, toggleTheme }) {
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

  // Custom VEED modal states
  const [activeTab, setActiveTab] = useState('blank-project'); // 'blank-project' | 'use-template'
  
  // Quick actions simulations
  const [recording, setRecording] = useState(false);
  const [recTimer, setRecTimer] = useState(3);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

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

  // Screen recording simulation timer
  useEffect(() => {
    let t;
    if (recording) {
      if (recTimer > 0) {
        t = setTimeout(() => setRecTimer(v => v - 1), 1000);
      } else {
        setRecording(false);
        // Create simulated recorded file
        loadMockMedia('recorded_clip.webm', 8.5 * 1024 * 1024, 'video/webm');
      }
    }
    return () => clearTimeout(t);
  }, [recording, recTimer]);

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

  // Mock file generator
  const loadMockMedia = (filename, sizeBytes, mimeType) => {
    const blob = new Blob([new Uint8Array(sizeBytes)], { type: mimeType });
    const mockFile = new File([blob], filename, { type: mimeType, lastModified: Date.now() });
    setFile(mockFile);
    setError('');
    // Clear link input / rec overlay
    setShowLinkInput(false);
    setUrlInput('');
  };

  const startSimulatedRecording = () => {
    setRecTimer(3);
    setRecording(true);
    setFile(null);
  };

  const submitUrlImport = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      setUrlError('Please enter a valid URL (starting with http:// or https://)');
      return;
    }
    setUrlError('');
    // Simulate link fetch
    const name = urlInput.split('/').pop().split('?')[0] || 'remote_file.bin';
    loadMockMedia(name, 15.6 * 1024 * 1024, 'application/octet-stream');
  };

  const formatBytes = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 2 * 1024) return `${(b / 1024 ** 2).toFixed(1)} MB`;
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

  // Mimetype and name extensions based file icon selector
  const getFileEmoji = (mimeType, name) => {
    if (mimeType) {
      if (mimeType.startsWith('video/')) return '🎬';
      if (mimeType.startsWith('audio/')) return '🎵';
      if (mimeType.startsWith('image/')) return '🖼️';
      if (mimeType === 'application/pdf') return '📄';
      if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('compressed')) return '🗜️';
      if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript')) return '📝';
    }
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      mp4: '🎬', mov: '🎬', webm: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🖼️', webp: '🖼️',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️',
      txt: '📝', js: '📝', ts: '📝', html: '📝', css: '📝', json: '📝',
      pdf: '📄',
    };
    return map[ext] || '📁';
  };

  return (
    <div className="veed-modal">
      
      {/* ── Main Content Panel ────────────────────────────────────────── */}
      <main className="veed-content">
        
        {/* If file is active: display encryption settings and upload controls */}
        {file ? (
          <div className="active-file-panel">
            <div className="active-file-card">
              <div className="active-file-card__icon">{getFileEmoji(file.type, file.name)}</div>
              <div className="active-file-card__meta">
                <h4 className="active-file-card__name" title={file.name}>{file.name}</h4>
                <p className="active-file-card__size">{formatBytes(file.size)}</p>
              </div>
              {!uploading && (
                <button className="btn-close-active" onClick={() => setFile(null)} title="Clear file">✕</button>
              )}
            </div>

            {/* Options Toggle */}
            {!uploading && (
              <button className="btn-text btn-text--options" style={{ marginTop: '0.5rem' }} onClick={() => setShowOptions(v => !v)}>
                <span>{showOptions ? '▲' : '▼'}</span>
                {showOptions ? 'Hide security options' : 'Configure security & expiry options'}
              </button>
            )}

            {/* Options Form */}
            {showOptions && !uploading && (
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
                    <label className="field__label">✅ Allowed IPs</label>
                    <input
                      className="field__input"
                      type="text"
                      placeholder="Comma-separated list"
                      value={options.allowedIps}
                      onChange={e => setOptions(o => ({ ...o, allowedIps: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">🚫 Blocked IPs</label>
                    <input
                      className="field__input"
                      type="text"
                      placeholder="Comma-separated list"
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
                  <span>{progress}% uploaded ({formatBytes((progress / 100) * file.size)} of {formatBytes(file.size)})</span>
                  <button className="btn-cancel" onClick={cancelUpload}>Cancel</button>
                </div>
                <div className="chunk-grid">
                  {chunkProgress.map((p, i) => (
                    <div key={i} className={`chunk-dot ${p === 100 ? 'chunk-dot--done' : p > 0 ? 'chunk-dot--active' : ''}`} title={`Part ${i + 1}: ${p}%`} />
                  ))}
                </div>
              </div>
            )}

            {error && <p className="error-msg">{error}</p>}

            {/* Action buttons */}
            {!uploading && (
              <div style={{ marginTop: '1.5rem' }}>
                {resumeSession ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button className="btn-upload" onClick={() => startUpload(true)}>
                      Resume Upload ({Math.round((resumeSession.completedParts.length / Math.ceil(file.size / CHUNK_SIZE)) * 100)}% done)
                    </button>
                    <button className="btn-text" style={{ alignSelf: 'center', marginTop: 0 }} onClick={() => startUpload(false)}>
                      Or start clean (ignores previous progress)
                    </button>
                  </div>
                ) : (
                  <button className="btn-upload" onClick={() => startUpload(false)}>
                    ⚡ Encrypt & Share Securely
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          
          /* Main Dashboard Views - Just Simple Drop Zone */
          <div className="veed-main-scroll" style={{ padding: '2.5rem' }}>
            <div
              className={`veed-dropzone ${dragging ? 'veed-dropzone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
              style={{ flex: 1, display: 'flex', minHeight: '320px', justifyContent: 'center' }}
            >
              <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <svg className="veed-dropzone__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
                <path d="M12 16V8m0 0l-4 4m4-4l4 4" />
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
              </svg>
              <h3 className="veed-dropzone__title">Upload a File</h3>
              <p className="veed-dropzone__sub">Click to browse, or drag & drop a file here</p>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}
