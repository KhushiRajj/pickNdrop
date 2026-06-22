import { useState } from 'react';

export default function SharePanel({ result }) {
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

      {/* QR Code */}
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

      {/* Link */}
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

      {/* Audit log link */}
      <a className="btn-text" href={`/d/${token}?audit=1`} target="_blank" rel="noreferrer">
        View download log →
      </a>
    </div>
  );
}
