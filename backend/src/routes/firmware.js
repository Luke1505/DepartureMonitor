import { Router } from 'express';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import multer from 'multer';
import { triggerBuild, getBuildStatus } from '../services/buildWorker.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const OTA_DIR = process.env.OTA_DIR || './firmware';

// Use memory storage so req.body.version is fully parsed before we write files.
// Files are written to disk in the route handler once version is known.
const upload = multer({ storage: multer.memoryStorage() });

export default function firmwareRouter(pool, requireDeviceToken) {
  const router = Router();

  // GET /api/firmware/ota-download/:filename  — proxies binary from build-worker to device
  router.get('/ota-download/:filename', requireDeviceToken, async (req, res) => {
    const { filename } = req.params;
    if (!filename.endsWith('.bin') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    try {
      const workerUrl = `${process.env.BUILD_WORKER_URL || 'http://build-worker:3001'}/builds/${filename}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let upstream;
      try {
        upstream = await fetch(workerUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!upstream.ok) return res.status(404).json({ error: 'Binary not available' });
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/ota-check?deviceId=<id>
  router.get('/ota-check', requireDeviceToken, async (req, res) => {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    try {
      const { rows } = await pool.query(
        'SELECT display_type, language FROM devices WHERE id = $1',
        [deviceId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Device not found' });

      const { display_type, language } = rows[0];
      const { job_id, status, cache_key } = await triggerBuild(display_type, language);

      if (status === 'ready') {
        const version = (cache_key ? cache_key.split('-').slice(1, -2).join('-') : '') || cache_key || 'dev';
        const url = `/api/firmware/ota-download/${cache_key}-firmware.bin`;
        return res.json({ available: true, url, cache_key, version });
      }
      if (status === 'building') {
        return res.json({ available: false, building: true, retry_after: 60, job_id });
      }
      return res.json({ available: false, error: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/ota-status/:job_id
  router.get('/ota-status/:job_id', requireDeviceToken, async (req, res) => {
    const { job_id } = req.params;
    try {
      const result = await getBuildStatus(job_id);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/latest?channel=stable
  router.get('/latest', async (req, res) => {
    const channel = req.query.channel || 'stable';
    const validChannels = ['stable', 'beta', 'dev'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM firmware_versions WHERE is_latest = TRUE AND channel = $1 ORDER BY created_at DESC LIMIT 1',
        [channel]
      );
      if (!rows.length) return res.status(404).json({ error: `Kein Firmware verfügbar für ${channel}` });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/versions
  router.get('/versions', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM firmware_versions ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/versions/:channel
  router.get('/versions/:channel', async (req, res) => {
    const { channel } = req.params;
    const validChannels = ['stable', 'beta', 'dev'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM firmware_versions WHERE channel = $1 ORDER BY created_at DESC',
        [channel]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/manifest/:channel  → ESP Web Tools manifest JSON
  router.get('/manifest/:channel', async (req, res) => {
    const { channel } = req.params;
    const validChannels = ['stable', 'beta', 'dev'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM firmware_versions WHERE channel = $1 AND is_latest = TRUE ORDER BY created_at DESC LIMIT 1',
        [channel]
      );
      if (!rows.length) return res.status(404).json({ error: `No firmware for channel: ${channel}` });

      const fw = rows[0];
      const manifest = {
        name: 'DepartureMonitor',
        version: fw.version,
        home_assistant_domain: null,
        funding_url: null,
        new_install_prompt_erase: true,
        builds: [
          {
            chipFamily: 'ESP32',
            parts: [
              { path: `/api/firmware/download/${fw.version}/bootloader.bin`, offset: 4096 },
              { path: `/api/firmware/download/${fw.version}/partitions.bin`, offset: 32768 },
              { path: `/api/firmware/download/${fw.version}/firmware.bin`, offset: 65536 },
            ],
          },
        ],
      };
      res.json(manifest);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/firmware/download/:version/:filename
  router.get('/download/:version/:filename', async (req, res) => {
    const { version, filename } = req.params;

    // Whitelist allowed filenames to prevent path traversal
    const allowed = ['bootloader.bin', 'partitions.bin', 'firmware.bin'];
    if (!allowed.includes(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    // Validate version to prevent path traversal (semver-like: digits, dots, hyphens only)
    if (!/^[a-zA-Z0-9._-]+$/.test(version) || version.includes('..')) {
      return res.status(400).json({ error: 'Invalid version' });
    }

    const filePath = join(OTA_DIR, version, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  });

  // Legacy: GET /api/firmware/download/:version  (single-file compat)
  router.get('/download/:version', async (req, res) => {
    const { version } = req.params;
    // Validate version to prevent path traversal
    if (!/^[a-zA-Z0-9._-]+$/.test(version) || version.includes('..')) {
      return res.status(400).json({ error: 'Invalid version' });
    }
    try {
      const { rows } = await pool.query(
        'SELECT * FROM firmware_versions WHERE version = $1',
        [version]
      );
      if (!rows.length) return res.status(404).json({ error: 'Version not found' });

      const filePath = join(OTA_DIR, version, rows[0].filename || 'firmware.bin');
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'Firmware file not found on server' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${rows[0].filename || 'firmware.bin'}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/firmware/flash-build  — trigger a build for USB flashing
  router.post('/flash-build', async (req, res) => {
    const { deviceId } = req.body || {};
    let displayType = 'bwr';
    let language = 'de';

    if (deviceId) {
      try {
        const { rows } = await pool.query(
          'SELECT display_type, language FROM devices WHERE id = $1',
          [deviceId]
        );
        if (rows.length) {
          displayType = rows[0].display_type || 'bwr';
          language = rows[0].language || 'de';
        }
      } catch (_) { /* use defaults */ }
    }

    try {
      const result = await triggerBuild(displayType, language);
      const version = result.cache_key
        ? result.cache_key.split('-').slice(1, -2).join('-')
        : 'dev';
      res.json({ ...result, version, display_type: displayType, language });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Build worker unavailable' });
    }
  });

  // GET /api/firmware/flash-status/:jobId
  router.get('/flash-status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
      const result = await getBuildStatus(jobId);
      const version = result.cache_key
        ? result.cache_key.split('-').slice(1, -2).join('-')
        : undefined;
      res.json({ ...result, version });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Build worker unavailable' });
    }
  });

  // GET /api/firmware/flash-manifest/:cacheKey  — esp-web-tools manifest
  router.get('/flash-manifest/:cacheKey', (req, res) => {
    const { cacheKey } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(cacheKey) || cacheKey.includes('..')) {
      return res.status(400).json({ error: 'Invalid cache key' });
    }
    const base = `/api/firmware/flash-bin/${encodeURIComponent(cacheKey)}`;
    const version = cacheKey.split('-').slice(1, -2).join('-') || 'dev';
    res.json({
      name: 'DepartureMonitor',
      version,
      new_install_prompt_erase: true,
      builds: [{
        chipFamily: 'ESP32',
        parts: [
          { path: `${base}/bootloader.bin`, offset: 4096 },
          { path: `${base}/partitions.bin`, offset: 32768 },
          { path: `${base}/firmware.bin`, offset: 65536 },
        ],
      }],
    });
  });

  // GET /api/firmware/flash-bin/:cacheKey/:part  — proxy binary from build-worker
  router.get('/flash-bin/:cacheKey/:part', async (req, res) => {
    const { cacheKey, part } = req.params;
    const allowed = ['bootloader.bin', 'partitions.bin', 'firmware.bin'];
    if (!allowed.includes(part)) return res.status(400).json({ error: 'Invalid part' });
    if (!/^[a-zA-Z0-9._-]+$/.test(cacheKey) || cacheKey.includes('..')) {
      return res.status(400).json({ error: 'Invalid cache key' });
    }
    try {
      const workerUrl = `${process.env.BUILD_WORKER_URL || 'http://build-worker:3001'}/builds/${cacheKey}-${part}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let upstream;
      try {
        upstream = await fetch(workerUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!upstream.ok) return res.status(404).json({ error: 'Binary not available' });
      res.setHeader('Content-Disposition', `attachment; filename="${part}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/firmware/upload  (multipart, admin protected)
  router.post(
    '/upload',
    requireAdmin,
    upload.fields([
      { name: 'bootloader', maxCount: 1 },
      { name: 'partitions', maxCount: 1 },
      { name: 'firmware', maxCount: 1 },
    ]),
    async (req, res) => {
      const { version, changelog, channel = 'stable' } = req.body;

      if (!version) return res.status(400).json({ error: 'version required' });
      if (!req.files?.firmware?.[0]) return res.status(400).json({ error: 'firmware file required' });
      // Validate version to prevent path traversal
      if (!/^[a-zA-Z0-9._-]+$/.test(version) || version.includes('..')) {
        return res.status(400).json({ error: 'Invalid version' });
      }

      try {
        // Write uploaded buffers to disk now that req.body is fully parsed
        const dir = join(OTA_DIR, version);
        mkdirSync(dir, { recursive: true });
        for (const field of ['bootloader', 'partitions', 'firmware']) {
          const file = req.files[field]?.[0];
          if (file) writeFileSync(join(dir, `${field}.bin`), file.buffer);
        }

        // Unset previous latest for this channel before marking new one
        await pool.query(
          'UPDATE firmware_versions SET is_latest = FALSE WHERE channel = $1',
          [channel]
        );

        const { rows } = await pool.query(
          `INSERT INTO firmware_versions (version, filename, changelog, is_latest, channel)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (version) DO UPDATE
             SET changelog = $3, is_latest = $4, channel = $5
           RETURNING *`,
          [version, 'firmware.bin', changelog || null, true, channel]
        );

        res.json({ status: 'uploaded', firmware: rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

