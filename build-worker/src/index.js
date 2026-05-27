import express from 'express';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, createReadStream } from 'fs';
import { cp, readdir, rm } from 'fs/promises';
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

  // Recursively hash all files under a directory, sorted for determinism
  function hashDir(dir) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        hashDir(fullPath);
      } else {
        hash.update(fullPath.slice(FIRMWARE_DIR.length)); // stable relative path
        hash.update(readFileSync(fullPath));
      }
    }
  }

  hashDir(join(FIRMWARE_DIR, 'src'));

  const iniPath = join(FIRMWARE_DIR, 'platformio.ini');
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
      const raw = readFileSync(p, 'utf8').trim();
      // Reject anything that could inject path components or preprocessor flags
      if (/^[a-zA-Z0-9._-]+$/.test(raw) && !raw.includes('..')) return raw;
    }
  }
  return process.env.FIRMWARE_VERSION || 'dev';
}

async function runBuild(jobId, cacheKey, displayType, language, serverUrl, version) {
  const job = jobs.get(jobId);
  const workDir = join(WORK_DIR, jobId);

  try {
    // Clean any stale workDir from a previous run before copying.
    // If workDir already exists when cp() runs, Node copies /firmware INTO it as a
    // subdirectory (/work/uuid/firmware/) instead of expanding its contents directly,
    // causing PlatformIO to fail with "platformio.ini not found".
    await rm(workDir, { recursive: true, force: true });
    await cp(FIRMWARE_DIR, workDir, { recursive: true });

    const displayTypeUpper = displayType.toUpperCase();
    const langUpper = language.toUpperCase();
    // Use only the origin (scheme + host + port) to avoid injecting path/query characters
    // into the preprocessor flag string.
    const serverOrigin = new URL(serverUrl).origin;
    const extraFlags = `-DDISPLAY_${displayTypeUpper} -DLANG_${langUpper} -DSERVER_BASE_URL='"${serverOrigin}"' -DFIRMWARE_VERSION='"${version}"'`;

    const env = {
      ...process.env,
      PLATFORMIO_BUILD_DIR: join(workDir, '.pio', 'build'),
      PLATFORMIO_LIBDEPS_DIR: join(PIO_CACHE_DIR, 'libdeps'),
      PLATFORMIO_PACKAGES_DIR: join(PIO_CACHE_DIR, 'packages'),
      EXTRA_FLAGS: extraFlags,
    };

    const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(
        'platformio',
        ['run', '--project-dir', workDir, '-e', 'firmware-custom'],
        { env, cwd: workDir }
      );

      // Capture both stdout and stderr — PlatformIO writes build output to stdout
      const outputLines = [];
      proc.stdout.on('data', (data) => { for (const l of data.toString().split('\n')) outputLines.push(l); });
      proc.stderr.on('data', (data) => { for (const l of data.toString().split('\n')) outputLines.push(l); });

      const buildTimeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve({ code: -1, tail: 'Build timed out after 10 minutes' });
      }, BUILD_TIMEOUT_MS);

      proc.on('close', (code) => {
        clearTimeout(buildTimeout);
        const tail = outputLines.slice(-80).join('\n');
        resolve({ code, tail });
      });
      proc.on('error', (err) => {
        clearTimeout(buildTimeout);
        reject(err);
      });
    });

    if (result.code !== 0) {
      job.status = 'error';
      job.error = result.tail;
      job.completedAt = Date.now();
      return;
    }

    // Copy all built binaries to cache
    const builtDir = join(workDir, '.pio', 'build', 'firmware-custom');
    const parts = ['firmware', 'bootloader', 'partitions'];
    for (const part of parts) {
      const src = join(builtDir, `${part}.bin`);
      if (existsSync(src)) {
        copyFileSync(src, join(BUILDS_DIR, `${cacheKey}-${part}.bin`));
      }
    }
    // Legacy single .bin (for OTA compat)
    const legacySrc = join(builtDir, 'firmware.bin');
    if (existsSync(legacySrc)) {
      copyFileSync(legacySrc, join(BUILDS_DIR, `${cacheKey}.bin`));
    }

    job.status = 'ready';
    job.url = `/builds/${cacheKey}.bin`;
    job.completedAt = Date.now();
  } catch (err) {
    job.status = 'error';
    job.error = String(err);
    job.completedAt = Date.now();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function pruneOldJobs() {
  const TTL_MS = 60 * 60 * 1000; // 1 hour
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (job.status !== 'building' && now - (job.completedAt || 0) > TTL_MS) {
      jobs.delete(id);
    }
  }
}

// POST /build
app.post('/build', async (req, res) => {
  pruneOldJobs();
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
  try {
    const parsed = new URL(server_url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'server_url must use http or https' });
    }
  } catch {
    return res.status(400).json({ error: 'server_url must be a valid URL' });
  }

  const sourceHash = computeSourceHash();
  const version = readFirmwareVersion();
  const originHash = createHash('sha256').update(new URL(server_url).origin).digest('hex').slice(0, 8);
  const cacheKey = `${sourceHash}-${version}-${display_type}-${language}-${originHash}`;
  const cacheBin = join(BUILDS_DIR, `${cacheKey}.bin`);

  // Already cached on disk — require all three parts to be present to avoid a partial hit
  const allPartsCached = ['firmware', 'bootloader', 'partitions'].every(
    (p) => existsSync(join(BUILDS_DIR, `${cacheKey}-${p}.bin`))
  );
  if (allPartsCached || existsSync(cacheBin)) {
    const jobId = randomUUID();
    jobs.set(jobId, { status: 'ready', cacheKey, url: `/builds/${cacheKey}.bin`, completedAt: Date.now() });
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

  // Fire and forget — catch ensures any pre-status-update throw still marks the job as error
  runBuild(jobId, cacheKey, display_type, language, server_url, version).catch((err) => {
    const job = jobs.get(jobId);
    if (job && job.status === 'building') {
      job.status = 'error';
      job.error = String(err);
      job.completedAt = Date.now();
    }
  });

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
