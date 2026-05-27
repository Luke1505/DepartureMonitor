import rateLimit from 'express-rate-limit';

export const deviceRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '60'),
  keyGenerator: (req) => req.params.id || req.query.deviceId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

export const configRateLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  keyGenerator: (req) => `config:${req.params.id || 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

export const registerRateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' },
});

// Per-device: 3 token requests per 5 minutes
export const tokenRequestDeviceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `device:${req.params.id || 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests for this device, please wait.' },
});

// Build trigger: 5 builds per 10 minutes per IP (flash-build is unauthenticated)
export const buildRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many build requests, please wait.' },
});

// Per-IP: 10 token requests per 5 minutes across all devices
export const tokenRequestIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please wait.' },
});
