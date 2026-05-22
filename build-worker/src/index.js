import express from 'express';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, createReadStream } from 'fs';
import { cp, readdir } from 'fs/promises';
import { spawn } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

const FIRMWARE_DIR = '/firmware';
const BUILDS_DIR = '/builds';
const WORK_DIR = '/work';
const PIO_CACHE_DIR = '/pio-cache';

const ALLOWED_DISPLAY_TYPES = ['bwr', 'bw'];
const ALLOWED_LANGUAGES = ['de', 'en', 'fr'];

// In-memory job registry
const jobs = new Map();

mkdirSync(BUILDS_DIR, { recursive: true });
mkdirSync(WORK_DIR, { recursive: true });
mkdirSync(PIO_CACHE_DIR, { recursive: true });

function computeSourceHash() {
  const hash = createHash('sha256');
  const srcDir = join(FIRMWARE_DIR, 'src');
  const iniFile = join(FIRMWARE_DIR, '..', 'platformio.ini');

  // Hash all files in firmware/src, sorted for determinism
  if (existsSync(srcDir)) {
    const files = readdirSync(srcDir).sort();
    for (const f of files) {
      const content = readFileSync(join(srcDir, f));
      hash.update(f);
      hash.update(content);
    }
  }

  // Hash platformio.ini (mounted at /firmware/../platformio.ini = /platformio.ini)
  const iniPath = existsSync(iniFile) ? iniFile : '/platformio.ini';
  if (existsSync(iniPath)) {
    hash.update(readFileSync(iniPath));
  }

  return hash.digest('hex').slice(0, 16);
}

function readFirmwareVersion() {
  const paths = [
    join(FIRMWARE_DIR, 'VERSION'),
    join(FIRMWARE_DIR, '..', 'VERSION'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return readFileSync(p, 'utf8').trim();
    }
  }
  return process.env.FIRMWARE_VERSION || 'dev';
}

async function runBuild(jobId, cacheKey, displayType, language, serverUrl, version) {
  const job = jobs.get(jobId);
  const workDir = join(WORK_DIR, jobId);

  try {
    // Copy firmware source to per-job workspace
    await cp(FIRMWARE_DIR, workDir, { recursive: true });

    const displayTypeUpper = displayType.toUpperCase();
    const langUpper = language.toUpperCase();
    const extraFlags = `-DDISPLAY_${displayTypeUpper} -DLANG_${langUpper} -DSERVER_BASE_URL='"${serverUrl}"' -DFIRMWARE_VERSION='"${version}"'`;

    const env = {
      ...process.env,
      PLATFORMIO_BUILD_DIR: join(workDir, '.pio', 'build'),
      PLATFORMIO_LIBDEPS_DIR: join(PIO_CACHE_DIR, 'libdeps'),
      PLATFORMIO_PACKAGES_DIR: join(PIO_CACHE_DIR, 'packages'),
      EXTRA_FLAGS: extraFlags,
    };

    const result = await new Promise((resolve, reject) => {
      // No --project-dir: PlatformIO uses cwd (workDir) to find platformio.ini
      const proc = spawn(
        'platformio',
        ['run', '-e', 'firmware-custom'],
        { env, cwd: workDir }
      );

      // Capture both stdout and stderr — PlatformIO writes build output to stdout
      const outputLines = [];
      proc.stdout.on('data', (data) => outputLines.push(...data.toString().split('\n')));
      proc.stderr.on('data', (data) => outputLines.push(...data.toString().split('\n')));

      proc.on('close', (code) => {
        const tail = outputLines.slice(-80).join('\n');
        resolve({ code, tail });
      });
      proc.on('error', (err) => reject(err));
    });

    if (result.code !== 0) {
      job.status = 'error';
      job.error = result.tail;
      return;
    }

    // Copy built binary to cache
    const builtBin = join(workDir, '.pio', 'build', 'firmware-custom', 'firmware.bin');
    const cacheBin = join(BUILDS_DIR, `${cacheKey}.bin`);
    copyFileSync(builtBin, cacheBin);

    job.status = 'ready';
    job.url = `/builds/${cacheKey}.bin`;
  } catch (err) {
    job.status = 'error';
    job.error = String(err);
  }
}

// POST /build
app.post('/build', async (req, res) => {
  const { display_type, language, server_url } = req.body;

  if (!ALLOWED_DISPLAY_TYPES.includes(display_type)) {
    return res.status(400).json({ error: `Invalid display_type. Allowed: ${ALLOWED_DISPLAY_TYPES.join(', ')}` });
  }
  if (!ALLOWED_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `Invalid language. Allowed: ${ALLOWED_LANGUAGES.join(', ')}` });
  }
  if (!server_url) {
    return res.status(400).json({ error: 'server_url is required' });
  }

  const sourceHash = computeSourceHash();
  const version = readFirmwareVersion();
  const cacheKey = `${sourceHash}-${version}-${display_type}-${language}`;
  const cacheBin = join(BUILDS_DIR, `${cacheKey}.bin`);

  // Already cached on disk
  if (existsSync(cacheBin)) {
    const jobId = randomUUID();
    jobs.set(jobId, { status: 'ready', cacheKey, url: `/builds/${cacheKey}.bin` });
    return res.json({ job_id: jobId, status: 'ready', cache_key: cacheKey });
  }

  // Deduplicate: same cache key already building
  for (const [existingJobId, existingJob] of jobs.entries()) {
    if (existingJob.cacheKey === cacheKey && existingJob.status === 'building') {
      return res.json({ job_id: existingJobId, status: 'building', cache_key: cacheKey });
    }
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: 'building', cacheKey });

  // Fire and forget
  runBuild(jobId, cacheKey, display_type, language, server_url, version).catch(() => {});

  res.json({ job_id: jobId, status: 'building', cache_key: cacheKey });
});

// GET /build/:job_id
app.get('/build/:job_id', (req, res) => {
  const { job_id } = req.params;
  const job = jobs.get(job_id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'ready') {
    return res.json({ status: 'ready', url: job.url, cache_key: job.cacheKey });
  }
  if (job.status === 'error') {
    return res.json({ status: 'error', error: job.error });
  }
  return res.json({ status: 'building' });
});

// GET /builds/:filename
app.get('/builds/:filename', (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.bin') || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = join(BUILDS_DIR, filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  createReadStream(filePath).pipe(res);
});

app.listen(3001, () => {
  console.log('Build worker listening on port 3001');
});
