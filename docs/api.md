# DepartureMonitor — API Reference

Base URL (production): `https://transit.megaluke.de`

---

## Authentication

### Device token (`x-device-token`)

Most write and read endpoints that return sensitive data require a device token.

- Header: `x-device-token: <token>`
- Token format: 8 uppercase hex characters (e.g. `A3B4C5D6`)
- Tokens are generated server-side by `generateToken()` and stored in the `devices` table as `access_token`.
- The token is compared case-insensitively (server normalises to upper-case before comparison).
- Returns **401** `{ "error": "Unauthorized" }` when the token is missing, invalid, or does not match the `:id` in the URL.

### Admin secret (`x-admin-secret`)

Used for firmware upload only.

- Header: `x-admin-secret: <secret>`
- Value must match the `ADMIN_SECRET` environment variable.
- Returns **401** `{ "error": "Unauthorized" }` on mismatch.

---

## Rate Limiting

Two rate limiters are applied globally (configured via environment variables):

| Limiter | Default limit | Window | Key |
|---|---|---|---|
| `deviceRateLimiter` | 60 req | `RATE_LIMIT_WINDOW_MS` (default 60 000 ms) | `req.params.id` → `req.query.deviceId` → `req.ip` |
| `registerRateLimiter` | 10 req | 60 000 ms | `req.ip` |

Rate-limited responses include standard `RateLimit-*` headers. Exceeded limits return **429 Too Many Requests**.

---

## Device Endpoints

Base path: `/api/device`

### `GET /api/device`

Returns a public summary of all registered devices.

**Auth:** None  
**Rate limit:** None

**Response 200:**

```json
[
  {
    "id": "abc123",
    "name": "My Keychain",
    "firmware": "1.0.0",
    "battery_pct": 82,
    "last_seen": "2024-01-15T10:30:00Z",
    "is_setup": true
  }
]
```

---

### `GET /api/device/:id`

Returns the full record for a single device.

**Auth:** `x-device-token` required  
**Rate limit:** `deviceRateLimiter`

**Response 200:**

```json
{
  "id": "abc123",
  "name": "My Keychain",
  "firmware": "1.0.0",
  "battery_pct": 82,
  "last_seen": "2024-01-15T10:30:00Z",
  "is_setup": true,
  "ssid": "HomeWifi",
  "language": "de",
  "display_type": "bwr"
}
```

**Errors:** 401 Unauthorized

---

### `POST /api/device/:id/register`

Registers a new device or upserts an existing one. Generates an `access_token` if none exists.

**Auth:** None  
**Rate limit:** `registerRateLimiter` (10 req/min per IP)

**Request body:**

```json
{
  "name": "My Keychain",
  "firmware": "1.0.0"
}
```

**Response 200:**

```json
{
  "id": "abc123",
  "name": "My Keychain",
  "firmware": "1.0.0",
  "is_setup": false,
  "access_token": "A3B4C5D6"
}
```

> The `access_token` is only returned here and through the heartbeat `show_token` mechanism. Store it in NVS immediately.

---

### `POST /api/device/:id/heartbeat`

Updates device presence (battery, firmware, ssid, last_seen). If `pending_show_token` is set in the database, clears it and returns the token once.

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Request body:**

```json
{
  "battery_pct": 82,
  "firmware": "1.0.0",
  "ssid": "HomeWifi"
}
```

**Response 200 (normal):**

```json
{ "status": "ok" }
```

**Response 200 (token pending):**

```json
{
  "status": "ok",
  "show_token": "A3B4C5D6"
}
```

When `show_token` is present the firmware should display the access code screen and sleep for ~60 s.

---

### `POST /api/device/:id/token/request`

Signals the backend to send the device's access token on its next heartbeat. Used by the web UI to initiate device pairing without physical access to the device.

**Auth:** None  
**Rate limit:** None

**Response 200:**

```json
{ "status": "ok" }
```

---

### `POST /api/device/:id/token/regenerate`

Generates a new access token and invalidates the old one.

**Auth:** `x-device-token` required  
**Rate limit:** None

**Response 200:**

```json
{ "access_token": "F1E2D3C4" }
```

**Errors:** 401 Unauthorized

---

### `PATCH /api/device/:id`

Updates device settings.

**Auth:** `x-device-token` required  
**Rate limit:** `deviceRateLimiter`

**Request body** (all fields optional):

```json
{
  "language": "de",
  "display_type": "bwr"
}
```

| Field | Values |
|---|---|
| `language` | `de`, `en`, `fr` |
| `display_type` | `bwr` (black/white/red), `bw` (black/white) |

**Response 200:** Updated device record (same shape as `GET /api/device/:id`)

**Errors:** 400 Bad Request (invalid enum value), 401 Unauthorized

---

### `DELETE /api/device/:id`

Permanently deletes the device and all associated data.

**Auth:** `x-device-token` required  
**Rate limit:** `deviceRateLimiter`

**Response 200:**

```json
{ "status": "deleted" }
```

**Errors:** 401 Unauthorized

---

### `GET /api/device/:id/wifi`

Returns all saved WiFi networks for the device.

**Auth:** `x-device-token` required  
**Rate limit:** None

**Response 200:**

```json
[
  { "id": 1, "ssid": "HomeWifi", "device_id": "abc123" }
]
```

**Errors:** 401 Unauthorized

---

### `POST /api/device/:id/wifi`

Adds or updates a WiFi network (upsert on `device_id + ssid`).

**Auth:** `x-device-token` required  
**Rate limit:** None

**Request body:**

```json
{
  "ssid": "HomeWifi",
  "password": "secret"
}
```

**Response 200:** Created/updated network record

**Errors:** 400 (missing fields), 401 Unauthorized

---

### `DELETE /api/device/:id/wifi/:networkId`

Removes a specific WiFi network.

**Auth:** `x-device-token` required  
**Rate limit:** None

**Response 200:**

```json
{ "status": "deleted" }
```

**Errors:** 401 Unauthorized, 404 Not Found

---

## Config Endpoints

Base path: `/api/device` (config routes are nested under device)

### `GET /api/device/:id/config`

Returns the latest saved configuration for the device.

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Response 200** (device configured):

```json
{
  "stops": [
    { "stopId": "de:05111:17029", "api": "vrr", "name": "Hauptbahnhof" }
  ],
  "refreshMinutes": 5,
  "shutdownMinutes": 30,
  "batWarnPct": 15,
  "timezone": "Europe/Berlin"
}
```

**Response 202** (device not found or `is_setup = false`):

```json
{ "status": "pending_setup" }
```

Firmware should poll this endpoint every `CONFIG_POLL_INTERVAL_MS` (5 s) for up to `CONFIG_POLL_MAX_TRIES` (60) attempts while on the setup screen.

---

### `POST /api/device/:id/config`

Saves a new configuration snapshot. Also marks the device as `is_setup = true`.

**Auth:** `x-device-token` required  
**Rate limit:** `deviceRateLimiter`

**Request body:** Arbitrary JSON config object (same shape as the GET response above)

**Response 201:**

```json
{ "status": "saved" }
```

**Errors:** 401 Unauthorized

---

### `GET /api/device/:id/config/history`

Returns the last 10 config snapshots (metadata only, no config body).

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Response 200:**

```json
[
  { "id": 42, "device_id": "abc123", "created_at": "2024-01-15T10:00:00Z" },
  { "id": 41, "device_id": "abc123", "created_at": "2024-01-14T09:00:00Z" }
]
```

---

## Transit Endpoints

Base path: `/api/transit`

All transit endpoints are rate-limited with `deviceRateLimiter`.

### `GET /api/transit/departures`

Fetches live departure times for a stop.

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Query parameters:**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `stopId` | Yes | — | Stop identifier (format depends on `api`) |
| `api` | No | `vrr` | Transit API to query |
| `deviceId` | No | — | Used as rate-limit key instead of IP |

**Supported `api` values:** `vrr`, `mvv`, `db`, `hvv`

**Response 200:**

```json
[
  {
    "line": "U75",
    "direction": "Düsseldorf Hbf",
    "type": "subway",
    "departureTime": "2024-01-15T10:35:00+01:00",
    "delay": 2,
    "platform": "1"
  }
]
```

**Errors:** 502 Bad Gateway (upstream transit API failure)

---

### `GET /api/transit/stops`

Searches for stops by name.

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Query parameters:**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `q` | Yes | — | Search query string |
| `api` | No | `vrr` | Transit API to query |

**Response 200:**

```json
[
  { "id": "de:05111:17029", "name": "Düsseldorf Hbf", "type": "station" }
]
```

**Errors:** 502 Bad Gateway

---

### `GET /api/transit/weather`

Returns current weather for a coordinate.

**Auth:** None  
**Rate limit:** None

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `lat` | Yes | Latitude (decimal) |
| `lon` | Yes | Longitude (decimal) |

**Response 200:**

```json
{
  "temperature": 12.4,
  "description": "Partly cloudy",
  "icon": "04d"
}
```

**Errors:** 502 Bad Gateway

---

### `GET /api/transit/analytics/:id`

Returns the last 50 departure fetch events for a device (for diagnostics).

**Auth:** None  
**Rate limit:** `deviceRateLimiter`

**Response 200:**

```json
[
  {
    "id": 101,
    "device_id": "abc123",
    "stop_id": "de:05111:17029",
    "fetched_at": "2024-01-15T10:30:00Z",
    "departure_count": 4
  }
]
```

---

## Firmware Endpoints

Base path: `/api/firmware`

### `GET /api/firmware/ota-check`

Triggers an on-demand firmware build for the device's display type and language, then returns availability.

**Auth:** None  
**Rate limit:** None

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `deviceId` | Yes | Device ID (used to look up `display_type` and `language`) |

**Response 200 — build ready:**

```json
{
  "available": true,
  "url": "https://transit.megaluke.de/api/firmware/ota-download/abc123.bin",
  "cache_key": "abc123"
}
```

**Response 200 — build in progress:**

```json
{
  "available": false,
  "building": true,
  "retry_after": 60,
  "job_id": "job_xyz"
}
```

**Response 200 — no update needed:**

```json
{ "available": false }
```

---

### `GET /api/firmware/ota-download/:filename`

Proxies a compiled firmware binary from the build worker. The firmware downloads and flashes this file via `esp_https_ota`.

**Auth:** None  
**Rate limit:** None

**Path parameters:**

| Parameter | Validation |
|---|---|
| `filename` | Must end in `.bin`; must not contain `..` or `/` |

**Response 200:** Binary `application/octet-stream`

**Errors:** 400 (invalid filename), 404 (not found on build worker), 502 (build worker unreachable)

---

### `GET /api/firmware/ota-status/:job_id`

Polls build worker for the status of a specific build job.

**Auth:** None  
**Rate limit:** None

**Response 200:**

```json
{
  "job_id": "job_xyz",
  "status": "building",
  "progress": 45
}
```

or when complete:

```json
{
  "job_id": "job_xyz",
  "status": "ready",
  "cache_key": "abc123"
}
```

---

### `GET /api/firmware/latest`

Returns the latest stable firmware version record.

**Auth:** None  
**Rate limit:** None

**Response 200:**

```json
{
  "version": "1.2.0",
  "channel": "stable",
  "filename": "firmware.bin",
  "is_latest": true,
  "created_at": "2024-01-10T12:00:00Z"
}
```

---

### `GET /api/firmware/versions`

Returns all firmware version records.

**Auth:** None  
**Rate limit:** None

**Response 200:** Array of version objects (same shape as `/latest`)

---

### `GET /api/firmware/versions/:channel`

Returns firmware versions filtered by channel.

**Auth:** None  
**Rate limit:** None

**Path parameters:** `channel` — e.g. `stable`, `beta`

**Response 200:** Array of version objects

---

### `GET /api/firmware/manifest/:channel`

Returns an ESP Web Tools JSON manifest for flashing via browser.

**Auth:** None  
**Rate limit:** None

**Response 200:**

```json
{
  "name": "DepartureMonitor",
  "version": "1.2.0",
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "path": "/api/firmware/download/1.2.0/bootloader.bin",  "offset": 4096 },
        { "path": "/api/firmware/download/1.2.0/partitions.bin",  "offset": 32768 },
        { "path": "/api/firmware/download/1.2.0/firmware.bin",    "offset": 65536 }
      ]
    }
  ]
}
```

Flash offsets: bootloader `0x1000` (4096), partition table `0x8000` (32768), application `0x10000` (65536).

---

### `GET /api/firmware/download/:version/:filename`

Serves a firmware file from the OTA directory (`OTA_DIR/{version}/{filename}`).

**Auth:** None  
**Rate limit:** None

**Path parameters:**

| Parameter | Allowed values |
|---|---|
| `filename` | `bootloader.bin`, `partitions.bin`, `firmware.bin` |

**Response 200:** Binary `application/octet-stream`

**Errors:** 400 (filename not in whitelist), 404 (file not found)

---

### `GET /api/firmware/download/:version`

Legacy single-file compatibility endpoint. Serves the file named in the database record for that version.

**Auth:** None  
**Rate limit:** None

**Response 200:** Binary `application/octet-stream`

---

### `POST /api/firmware/upload`

Uploads a new firmware release. Sets `is_latest = true` for the uploaded version and clears the flag on the previous stable latest when `channel = stable`.

**Auth:** `x-admin-secret` required  
**Rate limit:** None

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `version` | string | Semver string, e.g. `1.2.0` |
| `channel` | string | `stable` or `beta` |
| `bootloader` | file | `bootloader.bin` |
| `partitions` | file | `partitions.bin` |
| `firmware` | file | `firmware.bin` |

**Response 201:**

```json
{ "status": "uploaded", "version": "1.2.0" }
```

**Errors:** 401 Unauthorized (wrong admin secret), 400 (missing files or fields)
