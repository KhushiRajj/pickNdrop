const requestIp = require('request-ip');

/**
 * Middleware: checks IP against allowed_ips and blocked_ips on the share link.
 * Expects req.shareLink to be set by a prior middleware.
 */
function ipFilter(req, res, next) {
  const link = req.shareLink;
  if (!link) return next();

  const clientIp = requestIp.getClientIp(req) || req.ip || '';

  // Check blocked IPs first
  if (link.blocked_ips && link.blocked_ips.length > 0) {
    if (link.blocked_ips.includes(clientIp)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'IP_BLOCKED',
      });
    }
  }

  // Check allowed IPs (whitelist)
  if (link.allowed_ips && link.allowed_ips.length > 0) {
    if (!link.allowed_ips.includes(clientIp)) {
      return res.status(403).json({
        error: 'Access denied: IP not whitelisted',
        code: 'IP_NOT_WHITELISTED',
      });
    }
  }

  req.clientIp = clientIp;
  next();
}

module.exports = { ipFilter };
