import { useState, useEffect } from 'react';
import { getAuditLog } from '../api/client';

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditLog({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getAuditLog(token)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.response?.data?.error || 'Failed to load log'); setLoading(false); });
  }, [token]);

  if (loading) return <div className="audit-loading"><span className="spinner-sm" /> Loading audit log…</div>;
  if (error)   return <p className="error-msg">{error}</p>;
  if (!data)   return null;

  const { logs, downloadCount, maxDownloads, expiresAt } = data;

  return (
    <div className="audit-section">
      <div className="audit-summary">
        <div className="audit-stat">
          <span className="audit-stat__value">{downloadCount}</span>
          <span className="audit-stat__label">
            {maxDownloads ? `/ ${maxDownloads}` : ''} downloads
          </span>
        </div>
        {expiresAt && (
          <div className="audit-stat">
            <span className="audit-stat__value" style={{ fontSize: '0.9rem' }}>
              {new Date(expiresAt) < new Date() ? '⛔ Expired' : '⏰ Active'}
            </span>
            <span className="audit-stat__label">{formatDate(expiresAt)}</span>
          </div>
        )}
        {maxDownloads === 1 && (
          <span className="badge badge--once">⚡ One-time link</span>
        )}
      </div>

      <h3 className="audit-section__title">
        Download Log
        <span className="badge" style={{ marginLeft: '0.5rem' }}>{logs.length}</span>
      </h3>

      {logs.length === 0 ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>No downloads yet.</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>IP Address</th>
                <th>Device / Browser</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id}>
                  <td className="audit-num">{i + 1}</td>
                  <td><code>{log.ip || '—'}</code></td>
                  <td className="ua-cell" title={log.user_agent}>
                    {parseUA(log.user_agent)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.downloaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function parseUA(ua = '') {
  if (!ua) return '—';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return '🌐 Chrome';
  if (ua.includes('Firefox')) return '🦊 Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return '🍎 Safari';
  if (ua.includes('Edg')) return '🔷 Edge';
  if (ua.includes('curl')) return '⚙️ curl';
  if (ua.includes('Postman')) return '📮 Postman';
  return ua.substring(0, 42) + (ua.length > 42 ? '…' : '');
}
