import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createPool, initDb } from './db/schema.js';
import deviceRouter from './routes/device.js';
import configRouter from './routes/config.js';
import transitRouter from './routes/transit.js';
import firmwareRouter from './routes/firmware.js';
import { makeDeviceAuthMiddleware } from './middleware/deviceAuth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const pool = createPool();

const requireDeviceToken = makeDeviceAuthMiddleware(pool);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Device routes:
//   open:      GET / (list), POST /:id/register, POST /:id/token/request
//   protected: GET /:id, PATCH /:id, DELETE /:id, POST /:id/heartbeat, wifi routes, token/regenerate
app.use('/api/device', deviceRouter(pool, requireDeviceToken));

// Config routes:
//   open:      GET /:id/config  (device fetches on boot)
//   protected: POST /:id/config (web UI saves)
app.use('/api/device', configRouter(pool, requireDeviceToken));

// Transit + firmware device endpoints — always open (device uses these)
app.use('/api/transit', transitRouter(pool, requireDeviceToken));
app.use('/api/firmware', firmwareRouter(pool));

// Serve frontend static files
const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

async function start() {
  try {
    await initDb(pool);
    app.listen(PORT, () => {
      console.log(`Transit backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
