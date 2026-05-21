// Service to communicate with the build-worker container
const BUILD_WORKER_URL = process.env.BUILD_WORKER_URL || 'http://localhost:3001';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'https://transit.megaluke.de';

export async function triggerBuild(displayType, language) {
  const res = await fetch(`${BUILD_WORKER_URL}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_type: displayType, language, server_url: SERVER_BASE_URL }),
  });
  if (!res.ok) throw new Error(`Build worker error: ${res.status}`);
  return res.json(); // { job_id, status, cache_key }
}

export async function getBuildStatus(jobId) {
  const res = await fetch(`${BUILD_WORKER_URL}/build/${jobId}`);
  if (!res.ok) throw new Error(`Build worker error: ${res.status}`);
  return res.json(); // { status, url?, error? }
}

export function getBinaryUrl(cacheKey) {
  return `${BUILD_WORKER_URL}/builds/${cacheKey}.bin`;
}
