import pg from 'pg';

const { Pool } = pg;

export function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

export async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id          UUID PRIMARY KEY,
      name        TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      last_seen   TIMESTAMPTZ,
      firmware    TEXT,
      battery_pct INT,
      is_setup    BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS configs (
      id         SERIAL PRIMARY KEY,
      device_id  UUID REFERENCES devices(id) ON DELETE CASCADE,
      config     JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS configs_device_id ON configs(device_id);

    CREATE TABLE IF NOT EXISTS wifi_networks (
      id         SERIAL PRIMARY KEY,
      device_id  UUID REFERENCES devices(id) ON DELETE CASCADE,
      ssid       TEXT NOT NULL,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(device_id, ssid)
    );

    CREATE TABLE IF NOT EXISTS departure_events (
      id          SERIAL PRIMARY KEY,
      device_id   UUID REFERENCES devices(id) ON DELETE CASCADE,
      stop_id     TEXT NOT NULL,
      line        TEXT,
      destination TEXT,
      delay_mins  INT DEFAULT 0,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS dep_device_stop ON departure_events(device_id, stop_id);

    CREATE TABLE IF NOT EXISTS alerts (
      id         SERIAL PRIMARY KEY,
      device_id  UUID REFERENCES devices(id) ON DELETE CASCADE,
      stop_id    TEXT NOT NULL,
      line       TEXT,
      channel    TEXT NOT NULL,
      target     TEXT NOT NULL,
      active     BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS firmware_versions (
      id         SERIAL PRIMARY KEY,
      version    TEXT NOT NULL UNIQUE,
      filename   TEXT NOT NULL,
      changelog  TEXT,
      is_latest  BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssid TEXT;
    ALTER TABLE firmware_versions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'stable';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'de';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS display_type TEXT NOT NULL DEFAULT 'bwr';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS access_token TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_show_token BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS display_token TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS display_token_expires TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS build_jobs (
      id           TEXT PRIMARY KEY,
      cache_key    TEXT NOT NULL,
      display_type TEXT NOT NULL,
      language     TEXT NOT NULL,
      source_hash  TEXT NOT NULL,
      server_url   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'building',
      binary_path  TEXT,
      error_log    TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS build_jobs_cache_key ON build_jobs(cache_key);
  `);
  console.log('Database schema initialized');
}
