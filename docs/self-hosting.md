# Self-Hosting

This guide covers running the full DepartureMonitor stack on your own server.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker host                                        │
│                                                     │
│  ┌──────────────┐   ┌──────────────┐               │
│  │   postgres   │   │  build-worker│ (internal)    │
│  │  (port 5432) │   │  (port 3001) │               │
│  └──────┬───────┘   └──────┬───────┘               │
│         │                  │                        │
│  ┌──────▼──────────────────▼───────┐               │
│  │           backend               │               │
│  │         (port 3000)             │◄──── HTTPS ───┤
│  └─────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

- **backend** — Node.js 20 server that serves the web UI, REST API, and OTA firmware files.
- **postgres** — PostgreSQL 16 database.
- **build-worker** — Node.js service that compiles custom firmware (not exposed publicly).

The backend and frontend are shipped as a single Docker image (multi-stage build: Vite frontend → Node.js backend serving `backend/public`).

---

## Prerequisites

- Docker + Docker Compose
- A domain name with HTTPS termination in front of port 3000 (e.g. nginx/Caddy reverse proxy, or a platform like Coolify/Kamal)

---

## Quick start

1. **Clone the repository** (or just copy `docker-compose.yml` and `.env.example`).

2. **Create your `.env` file:**

   ```sh
   cp .env.example .env
   ```

3. **Edit `.env`** — see [Environment variables](#environment-variables) below.

4. **Start the stack:**

   ```sh
   docker compose up -d
   ```

5. The web UI is available at `http://localhost:3000` (or your configured domain).

---

## Environment variables

All variables are read by the **backend** service. Copy `.env.example` and fill in the required fields.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | ✅ | — | PostgreSQL password |
| `DATABASE_URL` | ✅ | — | Full Postgres connection string, e.g. `postgresql://transit:<DB_PASSWORD>@postgres:5432/transit` |
| `ADMIN_SECRET` | ✅ | — | Long random string protecting admin API endpoints |
| `PORT` | | `3000` | HTTP port the backend listens on |
| `NODE_ENV` | | `development` | Set to `production` in prod |
| `OTA_DIR` | | `./firmware` | Directory where uploaded firmware `.bin` files are stored; mapped to the `firmware_data` volume |
| `RATE_LIMIT_WINDOW_MS` | | `60000` | Rate-limit window in milliseconds |
| `RATE_LIMIT_MAX` | | `60` | Max requests per window per IP |
| `SITE_PASSWORD` | | — | Optional password to protect the whole web UI |
| `BUILD_WORKER_URL` | | `http://build-worker:3001` | Internal URL of the build-worker service (set automatically by Docker Compose) |
| `IMAGE_TAG` | | `latest` | Docker image tag to pull (used in `docker-compose.yml`) |

> **Security:** `ADMIN_SECRET` gates firmware upload and device management APIs. Use a long random value (e.g. `openssl rand -hex 32`).

---

## Volumes

| Volume | Mount point | Purpose |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | Database files |
| `firmware_data` | `/data/firmware` | OTA firmware binaries served at `/api/firmware/…` |

---

## Production deployment

The recommended workflow uses the included GitHub Actions pipeline and a container registry:

### GitHub Actions (`deploy.yml`)

The pipeline builds and pushes a Docker image to Harbor, then triggers a deployment via Komodo.

**Required GitHub secrets:**

| Secret | Description |
|---|---|
| `HARBOR_USERNAME` | Harbor registry username |
| `HARBOR_PASSWORD` | Harbor registry password |
| `KOMODO_WEBHOOK_URL` | Komodo deployment webhook URL |

You can adapt the workflow to any registry (GHCR, Docker Hub, etc.) by updating the registry host and credentials.

### Manual pull-and-restart

If you manage the server directly:

```sh
IMAGE_TAG=<new-tag> docker compose pull backend
docker compose up -d --no-deps backend
```

---

## Firmware OTA

The backend exposes two OTA endpoints consumed by the device firmware:

| Endpoint | Description |
|---|---|
| `GET /api/firmware/latest` | Returns the latest available firmware version string |
| `GET /api/firmware/download/<version>/firmware.bin` | Streams the firmware binary |

Firmware files are stored in `OTA_DIR` (the `firmware_data` Docker volume). Upload new firmware through the admin UI or directly place a `.bin` file at `OTA_DIR/<version>/firmware.bin`.

---

## Build worker

The **build-worker** service compiles custom firmware images on demand (e.g. for a specific language or server URL). It is only accessible within the Docker network — the backend proxies build requests to it via `BUILD_WORKER_URL`.

The build worker uses PlatformIO and receives build flags (`EXTRA_FLAGS`) from the backend, including:

- `-DSERVER_BASE_URL='"https://your-domain"'`
- `-DFIRMWARE_VERSION='"x.y.z"'`
- `-DLANG_DE` / `-DLANG_EN` / `-DLANG_FR`
- `-DDISPLAY_BW` / `-DDISPLAY_BWR`

Built `.bin` files are written to the shared `firmware_data` volume.

---

## Development mode

`docker-compose.dev.yml` extends the production compose file for local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Differences from production:

- Backend source (`./backend/src`) is bind-mounted into the container — no rebuild needed for server-side changes.
- PostgreSQL port **5432** is exposed to the host.
- Build-worker port **3001** is exposed to the host.
- `NODE_ENV=development` enables verbose logging and hot-reload.

---

## Security notes

- Place a TLS-terminating reverse proxy (nginx, Caddy, Traefik) in front of port 3000. The backend does not terminate HTTPS itself.
- Set `ADMIN_SECRET` to a high-entropy random value and keep it out of version control.
- The `SITE_PASSWORD` option adds HTTP Basic Auth to the entire web UI, useful if the instance should not be publicly browsable.
- The build-worker is intentionally not exposed outside the Docker network.
