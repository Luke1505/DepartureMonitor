import { Router } from 'express';
import { deviceRateLimiter } from '../middleware/rateLimiter.js';

export default function configRouter(pool, requireDeviceToken) {
  const router = Router();

  // GET /api/device/:id/config — open (device fetches on every boot)
  router.get('/:id/config', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const deviceResult = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
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
  router.post('/:id/config', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const config = req.body;

    try {
      await pool.query(
        `INSERT INTO devices (id, is_setup, last_seen) VALUES ($1, TRUE, NOW())
         ON CONFLICT (id) DO UPDATE SET is_setup = TRUE, last_seen = NOW()`,
        [id]
      );
      const { rows } = await pool.query(
        'INSERT INTO configs (device_id, config) VALUES ($1, $2) RETURNING *',
        [id, JSON.stringify(config)]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/device/:id/config/history
  router.get('/:id/config/history', deviceRateLimiter, async (req, res) => {
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
