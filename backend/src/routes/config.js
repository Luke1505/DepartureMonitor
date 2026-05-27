import { Router } from 'express';
import { configRateLimiter, deviceRateLimiter } from '../middleware/rateLimiter.js';

export default function configRouter(pool, requireDeviceToken) {
  const router = Router();

  // GET /api/device/:id/config — open (device fetches on every boot)
  router.get('/:id/config', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const deviceResult = await pool.query('SELECT is_setup FROM devices WHERE id = $1', [id]);
      if (!deviceResult.rows.length || !deviceResult.rows[0].is_setup) {
        return res.status(202).json({ status: 'pending_setup' });
      }

      const { rows } = await pool.query(
        'SELECT * FROM configs WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1',
        [id]
      );
      if (!rows.length) return res.status(202).json({ status: 'pending_setup' });

      res.json(rows[0].config);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/config  (requires device token)
  router.post('/:id/config', requireDeviceToken, configRateLimiter, async (req, res) => {
    const { id } = req.params;
    const config = req.body;

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'Invalid config' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO devices (id, is_setup, last_seen) VALUES ($1, TRUE, NOW())
         ON CONFLICT (id) DO UPDATE SET is_setup = TRUE, last_seen = NOW()`,
        [id]
      );
      await client.query('DELETE FROM configs WHERE device_id = $1', [id]);
      const { rows } = await client.query(
        'INSERT INTO configs (device_id, config) VALUES ($1, $2) RETURNING *',
        [id, config]
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // GET /api/device/:id/config/history  (requires device token)
  router.get('/:id/config/history', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT id, device_id, created_at FROM configs WHERE device_id = $1 ORDER BY created_at DESC LIMIT 10',
        [id]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
