/**
 * loginRateLimit.js
 *
 * IP-keyed sliding-window rate limiter for the login endpoint.
 *
 * Configuration via environment variables:
 *   AUTH_LOGIN_RATE_LIMIT_WINDOW_MS  (default: 900000 = 15 minutes)
 *   AUTH_LOGIN_RATE_LIMIT_MAX        (default: 20 attempts per window)
 *
 * Returns HTTP 429 { error: "rate_limit_exceeded" } when the limit is exceeded.
 * State is held in-process (Map); can be replaced with Redis for multi-instance.
 */

const ipWindowStore = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  return {
    windowMs: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toPositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 20)
  };
}

function resolveIp(req) {
  const forwardedFor = String(req.header("x-forwarded-for") || "").split(",")[0].trim();
  return forwardedFor || String(req.ip || req.socket?.remoteAddress || "unknown").trim() || "unknown";
}

function purgeStaleWindows(now) {
  for (const [key, entry] of ipWindowStore.entries()) {
    if (!entry || entry.resetAt <= now) {
      ipWindowStore.delete(key);
    }
  }
}

export function loginRateLimitMiddleware(req, res, next) {
  const { windowMs, max } = getConfig();
  const now = Date.now();

  // Periodic purge to prevent unbounded memory growth.
  purgeStaleWindows(now);

  const ip = resolveIp(req);
  const current = ipWindowStore.get(ip);
  const entry = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  entry.count += 1;
  ipWindowStore.set(ip, entry);

  if (entry.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({ error: "rate_limit_exceeded" });
  }

  next();
}

/**
 * Reset the counter for a given IP (call on successful login to give legitimate
 * users a clean slate after they authenticate).
 */
export function resetLoginRateLimit(req) {
  const ip = resolveIp(req);
  ipWindowStore.delete(ip);
}

// Exported for test inspection / manual resets.
export { ipWindowStore };
