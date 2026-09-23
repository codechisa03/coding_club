const crypto = require("crypto");

/**
 * Middleware to assign or forward an X-Request-ID header.
 * Ensures every incoming HTTP request gets a unique request ID for distributed tracing.
 */
function requestIdMiddleware(req, res, next) {
  const incomingId =
    req.headers["x-request-id"] ||
    req.headers["x-vercel-id"] ||
    req.headers["x-amzn-trace-id"] ||
    req.headers["cf-ray"];
  
  const requestId = incomingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}

module.exports = requestIdMiddleware;
