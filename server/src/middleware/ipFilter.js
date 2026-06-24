const requestIp = require('request-ip');

function ipFilter(req, res, next) {
  const link = req.shareLink;
  if (!link) return next();

  const clientIp = requestIp.getClientIp(req) || req.ip || '';

  if (link.blocked_ips && link.blocked_ips.length > 0) {
    if (link.blocked_ips.includes(clientIp)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'IP_BLOCKED',
      });
    }
  }

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
