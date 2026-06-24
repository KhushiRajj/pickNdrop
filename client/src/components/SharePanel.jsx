import { useState } from 'react';

export default function SharePanel({ result, options = {} }) {
  const { shareUrl, qrDataUrl, token } = result;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `pickndrop-qr-${token}.png`;
    a.click();
  };

  return (
    <div className="share-panel">
      <div className="share-panel__header">
        <div className="success-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Upload complete!
        </div>
        <h2 className="share-panel__title">Your link is ready</h2>
      </div>

      <div className="badge-row" style={{ marginBottom: '1.5rem' }}>
        {options.password     && <span className="badge badge--lock">🔒 Password protected</span>}
        {options.maxDownloads === '1' && <span className="badge badge--once">⚡ One-time link</span>}
        {options.maxDownloads && options.maxDownloads !== '1' &&
          <span className="badge badge--once">⬇ Max {options.maxDownloads} downloads</span>}
        {options.expiresAt    && (
          <span className="badge badge--ttl">
            ⏰ Expires {new Date(options.expiresAt).toLocaleString()}
          </span>
        )}
        {options.allowedIps   && <span className="badge">✅ IP whitelist</span>}
        {options.blockedIps   && <span className="badge">🚫 IP blacklist</span>}
        {!options.password && !options.maxDownloads && !options.expiresAt &&
          <span className="badge">🔓 Public link</span>}
      </div>

      <div className="qr-wrap">
        <img className="qr-img" src={qrDataUrl} alt="QR code for share link" />
        <button className="btn-qr" onClick={downloadQR}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download QR
        </button>
      </div>

      <div className="link-box">
        <input
          id="share-link-input"
          className="link-box__input"
          value={shareUrl}
          readOnly
          onFocus={e => e.target.select()}
        />
        <button id="copy-link-btn" className={`btn-copy ${copied ? 'btn-copy--done' : ''}`} onClick={copy}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      <a className="btn-text" href={`/d/${token}?audit=1`} target="_blank" rel="noreferrer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        View download audit log →
      </a>
    </div>
  );
}
