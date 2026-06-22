import { useState } from 'react';
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import Uploader from './components/Uploader';
import SharePanel from './components/SharePanel';
import Downloader from './components/Downloader';
import AuditLog from './components/AuditLog';

// ── Upload Page ───────────────────────────────────────────────────────────────
function UploadPage() {
  const [uploadResult, setUploadResult] = useState(null); // { token, shareUrl, qrDataUrl, options }

  return (
    <main className="page page--upload">
      <header className="site-header">
        <div className="logo">
          <span className="logo__icon">⚡</span>
          <span className="logo__text">pick<span className="logo__accent">N</span>drop</span>
        </div>
        <p className="tagline">Secure file sharing — chunked, encrypted, self-destructing</p>
      </header>

      <div className="card">
        {!uploadResult ? (
          <Uploader onComplete={(result, opts) => setUploadResult({ ...result, options: opts })} />
        ) : (
          <div>
            <SharePanel result={uploadResult} options={uploadResult.options || {}} />
            <button
              className="btn-text"
              style={{ marginTop: '1.5rem' }}
              onClick={() => setUploadResult(null)}
            >
              ← Upload another file
            </button>
          </div>
        )}
      </div>

      <footer className="site-footer">
        <p>Files stored on AWS S3 · Zero tracking · Links expire per your settings</p>
      </footer>
    </main>
  );
}

// ── Download Page ─────────────────────────────────────────────────────────────
function DownloadPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const showAudit = searchParams.get('audit') === '1';

  return (
    <main className="page page--download">
      <header className="site-header">
        <div className="logo">
          <span className="logo__icon">⚡</span>
          <span className="logo__text">pick<span className="logo__accent">N</span>drop</span>
        </div>
        <p className="tagline">Someone shared a file with you</p>
      </header>

      <div className="card">
        <Downloader token={token} />
      </div>

      {showAudit && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <AuditLog token={token} />
        </div>
      )}

      <footer className="site-footer">
        <p>Powered by pickNdrop · <a href="/">Share your own file</a></p>
      </footer>
    </main>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/d/:token" element={<DownloadPage />} />
      </Routes>
    </BrowserRouter>
  );
}
