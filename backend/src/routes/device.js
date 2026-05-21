import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { registerRateLimiter, deviceRateLimiter } from '../middleware/rateLimiter.js';

export default function deviceRouter(pool) {
  const router = Router();

  // GET /api/device/:id
  router.get('/:id', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Device not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/register
  router.post('/:id/register', registerRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { name, firmware } = req.body;

    try {
      const { rows } = await pool.query(
        `INSERT INTO devices (id, name, firmware, is_setup, last_seen)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (id) DO UPDATE
           SET name = COALESCE($2, devices.name),
               firmware = COALESCE($3, devices.firmware),
               is_setup = TRUE,
               last_seen = NOW()
         RETURNING *`,
        [id, name || null, firmware || null]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/heartbeat
  router.post('/:id/heartbeat', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { battery_pct, firmware, ssid } = req.body;

    try {
      // Auto-create device skeleton if not exists
      await pool.query(
        `INSERT INTO devices (id, battery_pct, firmware, ssid, last_seen)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE
           SET battery_pct = COALESCE($2, devices.battery_pct),
               firmware = COALESCE($3, devices.firmware),
               ssid = COALESCE($4, devices.ssid),
               last_seen = NOW()`,
        [id, battery_pct ?? null, firmware || null, ssid || null]
      );
      res.json({ status: 'ok' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/device/:id
  router.patch('/:id', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { language, display_type } = req.body;
    const allowed_languages = ['de', 'en', 'fr'];
    const allowed_displays = ['bwr', 'bw'];

    if (language && !allowed_languages.includes(language))
      return res.status(400).json({ error: 'Invalid language' });
    if (display_type && !allowed_displays.includes(display_type))
      return res.status(400).json({ error: 'Invalid display_type' });

    try {
      const { rows } = await pool.query(
        `UPDATE devices SET
          language = COALESCE($2, language),
          display_type = COALESCE($3, display_type)
         WHERE id = $1 RETURNING *`,
        [id, language || null, display_type || null]
      );
      if (!rows.length) return res.status(404).json({ error: 'Device not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/device/:id
  router.delete('/:id', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rowCount } = await pool.query('DELETE FROM devices WHERE id = $1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'Device not found' });
      res.json({ status: 'deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/device/:id/wifi
  router.get('/:id/wifi', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT id, ssid, password, created_at FROM wifi_networks WHERE device_id = $1 ORDER BY created_at',
        [id]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/wifi
  router.post('/:id/wifi', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { ssid, password } = req.body;

    if (!ssid || !password) {
      return res.status(400).json({ error: 'ssid and password required' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO wifi_networks (device_id, ssid, password)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id, ssid) DO UPDATE SET password = $3
         RETURNING id, ssid, created_at`,
        [id, ssid, password]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/device/:id/wifi/:networkId
  router.delete('/:id/wifi/:networkId', deviceRateLimiter, async (req, res) => {
    const { id, networkId } = req.params;
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM wifi_networks WHERE id = $1 AND device_id = $2',
        [networkId, id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Network not found' });
      res.json({ status: 'deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
