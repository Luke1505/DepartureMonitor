import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createPool } from './db/schema.js';
import { initDb } from './db/schema.js';
import deviceRouter from './routes/device.js';
import configRouter from './routes/config.js';
import transitRouter from './routes/transit.js';
import firmwareRouter from './routes/firmware.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const pool = createPool();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/device', deviceRouter(pool));
app.use('/api/device', configRouter(pool));
app.use('/api/transit', transitRouter(pool));
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
