import { Router } from 'express';
import { registerRateLimiter, deviceRateLimiter, tokenRequestDeviceLimiter, tokenRequestIpLimiter } from '../middleware/rateLimiter.js';
import { generateToken } from '../middleware/deviceAuth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { encrypt, decrypt } from '../lib/crypto.js';

export default function deviceRouter(pool, requireDeviceToken) {
  const router = Router();

  // GET /api/device  — open, returns public info only (no token or config)
  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, firmware, battery_pct, last_seen, is_setup FROM devices ORDER BY last_seen DESC NULLS LAST'
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/device/:id  (requires device token)
  router.get('/:id', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT id, name, firmware, battery_pct, last_seen, is_setup, ssid, language, display_type FROM devices WHERE id = $1',
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Device not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/register  — open, device calls on boot
  router.post('/:id/register', registerRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { name, firmware } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length > 64))
      return res.status(400).json({ error: 'Gerätename darf max. 64 Zeichen lang sein' });

    try {
      const existing = await pool.query('SELECT access_token FROM devices WHERE id = $1', [id]);
      const token = existing.rows[0]?.access_token || generateToken();

      const { rows } = await pool.query(
        `INSERT INTO devices (id, name, firmware, is_setup, last_seen, access_token)
         VALUES ($1, $2, $3, TRUE, NOW(), $4)
         ON CONFLICT (id) DO UPDATE
           SET firmware = COALESCE($3, devices.firmware),
               is_setup = TRUE,
               last_seen = NOW(),
               access_token = COALESCE(devices.access_token, $4)
         RETURNING id, name, firmware, is_setup, access_token`,
        [id, name || null, firmware || null, token]
      );
      // Only return the token on first registration (no prior token existed).
      // Subsequent calls preserve the existing token but don't expose it to callers.
      const responseRow = { ...rows[0] };
      if (existing.rows[0]?.access_token) delete responseRow.access_token;
      res.json(responseRow);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/heartbeat  — requires device token
  // If pending_show_token is set, response includes show_token (display_token) so device displays it
  router.post('/:id/heartbeat', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { battery_pct, firmware, ssid } = req.body;

    if (battery_pct != null && (typeof battery_pct !== 'number' || battery_pct < 0 || battery_pct > 100)) {
      return res.status(400).json({ error: 'battery_pct must be 0–100' });
    }

    try {
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

      // Atomically consume pending_show_token — only one concurrent call can succeed
      const { rows } = await pool.query(
        `UPDATE devices
         SET pending_show_token = FALSE
         WHERE id = $1
           AND pending_show_token = TRUE
           AND display_token IS NOT NULL
           AND display_token_expires > NOW()
         RETURNING display_token`,
        [id]
      );

      if (rows.length) {
        res.json({ status: 'ok', show_token: rows[0].display_token });
      } else {
        res.json({ status: 'ok' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/token/request  — open, rate-limited
  // Web UI calls this when no cached token; generates a short-lived display_token
  // which the device displays on screen. The real access_token is never transmitted.
  router.post('/:id/token/request', tokenRequestDeviceLimiter, tokenRequestIpLimiter, async (req, res) => {
    const { id } = req.params;
    const displayToken = generateToken();
    try {
      // Clean up expired tokens from all devices
      await pool.query(
        `UPDATE devices SET display_token = NULL, display_token_expires = NULL
         WHERE display_token_expires IS NOT NULL AND display_token_expires < NOW()`
      );
      const { rowCount } = await pool.query(
        `UPDATE devices
         SET pending_show_token = TRUE,
             display_token = $2,
             display_token_expires = NOW() + INTERVAL '90 seconds'
         WHERE id = $1
           AND (display_token IS NULL OR display_token_expires IS NULL OR display_token_expires < NOW())`,
        [id, displayToken]
      );
      if (!rowCount) {
        // Either device not found or an active pairing is already in progress
        const { rows } = await pool.query('SELECT id FROM devices WHERE id = $1', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Device not found' });
        return res.status(409).json({ error: 'Pairing already in progress' });
      }
      res.json({ status: 'ok' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/token/reset  — admin only; clears token so device self-heals on next 401
  router.post('/:id/token/reset', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const newToken = generateToken();
    try {
      const { rowCount } = await pool.query(
        'UPDATE devices SET access_token = $1 WHERE id = $2',
        [newToken, id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Device not found' });
      res.json({ status: 'reset' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/token/regenerate  — requires device token
  router.post('/:id/token/regenerate', requireDeviceToken, async (req, res) => {
    const { id } = req.params;
    const newToken = generateToken();
    try {
      await pool.query('UPDATE devices SET access_token = $1 WHERE id = $2', [newToken, id]);
      res.json({ access_token: newToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/device/:id  (requires device token)
  router.patch('/:id', requireDeviceToken, deviceRateLimiter, async (req, res) => {
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
         WHERE id = $1
         RETURNING id, name, firmware, battery_pct, last_seen, is_setup, ssid, language, display_type`,
        [id, language || null, display_type || null]
      );
      if (!rows.length) return res.status(404).json({ error: 'Device not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/device/:id  (requires device token)
  router.delete('/:id', requireDeviceToken, deviceRateLimiter, async (req, res) => {
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

  // GET /api/device/:id/wifi  (requires device token)
  router.get('/:id/wifi', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT id, ssid, password, created_at FROM wifi_networks WHERE device_id = $1 ORDER BY created_at',
        [id]
      );
      res.json(rows.map((r) => ({ ...r, password: decrypt(r.password) })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/device/:id/wifi  (requires device token)
  router.post('/:id/wifi', requireDeviceToken, deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    const { ssid, password = '' } = req.body;

    if (!ssid)
      return res.status(400).json({ error: 'ssid required' });
    if (typeof ssid !== 'string' || ssid.trim().length === 0 || ssid.length > 32)
      return res.status(400).json({ error: 'SSID muss zwischen 1 und 32 Zeichen lang sein' });
    if (typeof password !== 'string' || password.length > 64)
      return res.status(400).json({ error: 'Passwort darf max. 64 Zeichen lang sein' });

    try {
      const { rows } = await pool.query(
        `INSERT INTO wifi_networks (device_id, ssid, password)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id, ssid) DO UPDATE SET password = $3
         RETURNING id, ssid, created_at`,
        [id, ssid, encrypt(password)]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/device/:id/wifi/:networkId  (requires device token)
  router.delete('/:id/wifi/:networkId', requireDeviceToken, deviceRateLimiter, async (req, res) => {
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
