import { useState, useEffect } from 'react';
import { getLinkInfo, downloadFile, verifyPassword, getAuditLog } from '../api/client';

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export default function Downloader({ token, showAudit }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [auditLogs, setAuditLogs] = useState(null);

  useEffect(() => {
    getLinkInfo(token)
      .then(data => { setInfo(data); setNeedsPassword(data.hasPassword); setLoading(false); })
      .catch(err => { setError(err.response?.data?.error || 'Link not found'); setLoading(false); });
  }, [token]);

  useEffect(() => {
    if (showAudit && token) {
      getAuditLog(token).then(d => setAuditLogs(d)).catch(() => {});
    }
  }, [token, showAudit]);

  const triggerDownload = async (pw = null) => {
    setDownloading(true);
    setError('');
    try {
      const data = await downloadFile(token, pw || password || null);
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDone(true);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PASSWORD_REQUIRED' || code === 'WRONG_PASSWORD') {
        setNeedsPassword(true);
        setError('Incorrect password. Try again.');
      } else {
        setError(err.response?.data?.error || 'Download failed');
      }
    } finally {
      setDownloading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    try {
      await verifyPassword(token, password);
      await triggerDownload(password);
    } catch (err) {
      setError('Incorrect password');
    }
  };

  if (loading) return (
    <div className="downloader downloader--loading">
      <div className="spinner" />
      <p>Loading…</p>
    </div>
  );

  if (error && !needsPassword) return (
    <div className="downloader downloader--error">
      <div className="error-icon">⚠️</div>
      <h2>{error}</h2>
      {error.includes('expired') && <p className="muted">This link has expired and is no longer valid.</p>}
      {error.includes('limit') && <p className="muted">This file has reached its maximum download count.</p>}
    </div>
  );

  if (done) return (
    <div className="downloader downloader--done">
      <div className="done-icon">✅</div>
      <h2>Download started!</h2>
      <p className="muted">Your file is downloading. Check your downloads folder.</p>
    </div>
  );

  return (
    <div className="downloader">
      {info && (
        <div className="file-card">
          <div className="file-card__icon">{getFileEmoji(info.filename || '')}</div>
          <div className="file-card__meta">
            <p className="file-card__name">{info.filename || 'Unknown file'}</p>
            <p className="file-card__size">{formatBytes(info.sizeBytes)}</p>
          </div>
        </div>
      )}

      <div className="badge-row">
        {info?.hasPassword && <span className="badge badge--lock">🔒 Password protected</span>}
        {info?.isOneTime && <span className="badge badge--once">⚡ One-time link</span>}
        {info?.expiresAt && (
          <span className="badge badge--ttl">
            ⏰ Expires {new Date(info.expiresAt).toLocaleString()}
          </span>
        )}
      </div>

      {needsPassword ? (
        <form className="password-form" onSubmit={handlePasswordSubmit}>
          <label className="field__label">Enter password to download</label>
          <div className="password-row">
            <input
              id="download-password-input"
              className="field__input"
              type="password"
              placeholder="Passphrase…"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            <button id="unlock-btn" className="btn-upload" type="submit" disabled={downloading}>
              {downloading ? 'Verifying…' : 'Unlock & Download'}
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </form>
      ) : (
        <button
          id="download-btn"
          className="btn-upload"
          onClick={() => triggerDownload()}
          disabled={downloading}
        >
          {downloading ? (
            <><span className="spinner-sm" /> Preparing download…</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download File
            </>
          )}
        </button>
      )}

      {auditLogs && (
        <div className="audit-section">
          <h3 className="audit-section__title">Download Log <span className="badge">{auditLogs.downloadCount}</span></h3>
          {auditLogs.logs.length === 0 ? (
            <p className="muted">No downloads yet.</p>
          ) : (
            <table className="audit-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>User Agent</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.logs.map(log => (
                  <tr key={log.id}>
                    <td><code>{log.ip}</code></td>
                    <td className="ua-cell" title={log.user_agent}>{log.user_agent?.substring(0, 40) || '—'}…</td>
                    <td>{new Date(log.downloaded_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function getFileEmoji(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', zip: '🗜', mp4: '🎬',
    mp3: '🎵', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼',
    exe: '⚙️', dmg: '⚙️', xls: '📊', xlsx: '📊',
  };
  return map[ext] || '📁';
}
