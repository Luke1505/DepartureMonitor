import { randomBytes } from 'crypto';

export function generateToken() {
  // 8 uppercase hex chars, e.g. "A3B4C5D6"
  return randomBytes(4).toString('hex').toUpperCase();
}

export function makeDeviceAuthMiddleware(pool) {
  return async function requireDeviceToken(req, res, next) {
    const token = req.headers['x-device-token'];
    const id = req.params.id;
    if (!token || !id) return res.status(401).json({ error: 'Unauthorized' });

    const upperToken = token.toUpperCase();

    try {
      // Fast path: permanent access_token match
      const { rows } = await pool.query(
        'SELECT id FROM devices WHERE id = $1 AND access_token = $2',
        [id, upperToken]
      );
      if (rows.length) return next();

      // Slow path: valid display_token → promote it to access_token (single-use, atomic)
      const { rows: promoted } = await pool.query(
        `UPDATE devices
         SET access_token = $2,
             display_token = NULL,
             display_token_expires = NULL,
             pending_show_token = FALSE
         WHERE id = $1
           AND display_token = $2
           AND display_token_expires > NOW()
         RETURNING id`,
        [id, upperToken]
      );
      if (promoted.length) return next();

      return res.status(401).json({ error: 'Unauthorized' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
