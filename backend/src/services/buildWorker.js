// Service to communicate with the build-worker container
const BUILD_WORKER_URL = process.env.BUILD_WORKER_URL || 'http://localhost:3001';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'https://transit.megaluke.de';

async function workerFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`Build worker error: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function triggerBuild(displayType, language) {
  return workerFetch(`${BUILD_WORKER_URL}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_type: displayType, language, server_url: SERVER_BASE_URL }),
  });
}

export async function getBuildStatus(jobId) {
  return workerFetch(`${BUILD_WORKER_URL}/build/${jobId}`);
}

export function getBinaryUrl(cacheKey) {
  return `${BUILD_WORKER_URL}/builds/${cacheKey}.bin`;
}
