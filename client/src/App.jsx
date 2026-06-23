import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import Uploader from './components/Uploader';
import SharePanel from './components/SharePanel';
import Downloader from './components/Downloader';
import AuditLog from './components/AuditLog';

// ── Shared Navigation Bar ─────────────────────────────────────────────────────
function NavBar({ isDark, toggleTheme }) {
  return (
    <header className="site-nav">
      <div className="site-nav__container">
        <a href="/" className="logo">
          <span className="logo__icon">⚡</span>
          <span className="logo__text">pick<span className="logo__accent">N</span>drop</span>
        </a>
        
        <nav className="site-nav__links">
          <div className="theme-switch-row">
            <span className="theme-switch-label">{isDark ? '🌙 Dark' : '☀️ Light'}</span>
            <button className="theme-switch-btn" onClick={toggleTheme} aria-label="Toggle theme">
              <span className="theme-switch-dot" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

// ── Upload Page ───────────────────────────────────────────────────────────────
function UploadPage({ isDark, toggleTheme }) {
  const [uploadResult, setUploadResult] = useState(null); // { token, shareUrl, qrDataUrl, options }

  return (
    <main className="page page--upload">
      <div className="upload-container">
        <div className="card card--uploader-card">
          {!uploadResult ? (
            <Uploader 
              onComplete={(result, opts) => setUploadResult({ ...result, options: opts })} 
              isDark={isDark}
              toggleTheme={toggleTheme}
            />
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
  const [isDark, setIsDark] = useState(true); // Default to Dark Theme

  const toggleTheme = () => setIsDark(prev => !prev);

  // Apply classes to document.body so styling variable scopes resolve globally
  useEffect(() => {
    if (isDark) {
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
    } else {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    }
  }, [isDark]);

  return (
    <BrowserRouter>
      <div className="app-root">
        <NavBar isDark={isDark} toggleTheme={toggleTheme} />
        <Routes>
          <Route path="/" element={<UploadPage isDark={isDark} toggleTheme={toggleTheme} />} />
          <Route path="/d/:token" element={<DownloadPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
