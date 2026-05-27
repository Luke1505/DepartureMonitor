import { timingSafeEqual } from 'crypto';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!ADMIN_SECRET || !secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(ADMIN_SECRET);
  if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
