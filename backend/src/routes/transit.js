import { Router } from 'express';
import { deviceRateLimiter } from '../middleware/rateLimiter.js';
import { getDepartures, searchStops } from '../services/transitApi.js';
import { getWeather } from '../services/weatherApi.js';

export default function transitRouter(pool) {
  const router = Router();

  // GET /api/transit/departures?stopId=&api=vrr&deviceId=
  router.get('/departures', deviceRateLimiter, async (req, res) => {
    const { stopId, api = 'vrr', deviceId } = req.query;
    if (!stopId) return res.status(400).json({ error: 'stopId required' });

    try {
      const result = await getDepartures(stopId, api);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: 'Failed to fetch departures', detail: err.message });
    }
  });

  // GET /api/transit/stops?q=&api=vrr
  router.get('/stops', deviceRateLimiter, async (req, res) => {
    const { q, api = 'vrr' } = req.query;
    if (!q) return res.status(400).json({ error: 'q required' });

    try {
      const stops = await searchStops(q, api);
      res.json(stops);
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: 'Failed to search stops', detail: err.message });
    }
  });

  // GET /api/transit/weather?lat=&lon=
  router.get('/weather', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    try {
      const weather = await getWeather(lat, lon);
      res.json(weather);
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: 'Failed to fetch weather', detail: err.message });
    }
  });

  // GET /api/transit/analytics/:id
  router.get('/analytics/:id', deviceRateLimiter, async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM departure_events WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT 50',
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
