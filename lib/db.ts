import "server-only";
import postgres from "postgres";

/**
 * Postgres connection. DATABASE_URL is set automatically when a Neon database
 * is connected to the Vercel project (Storage tab).
 */
type Sql = ReturnType<typeof postgres>;
const globalForDb = globalThis as unknown as { __slcrSql?: Sql; __slcrSchema?: Promise<void> };

function connect(): Sql {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Connect a Postgres database to this project.");
  }
  return postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // required for pooled (PgBouncer) connection strings such as Neon's
    onnotice: () => {},
  });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  pw_version      INTEGER NOT NULL DEFAULT 1,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  name            TEXT NOT NULL,
  designation     TEXT NOT NULL DEFAULT '',
  emp_code        TEXT NOT NULL DEFAULT '',
  joined_on       TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  photo           BYTEA,
  photo_version   INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_pw  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login      TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS entries (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date           TEXT NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  hours          DOUBLE PRECISION NOT NULL CHECK (hours >= 0 AND hours <= 24),
  location       TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL,
  status         TEXT NOT NULL,
  title          TEXT NOT NULL,
  work           TEXT NOT NULL,
  outputs        TEXT NOT NULL DEFAULT '',
  next_plan      TEXT NOT NULL DEFAULT '',
  issues         TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_status  TEXT NOT NULL DEFAULT '',
  review_remark  TEXT NOT NULL DEFAULT '',
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS entries_user_date ON entries (user_id, date);
CREATE INDEX IF NOT EXISTS entries_date ON entries (date);
CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT NOT NULL,
  at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures (key);
CREATE TABLE IF NOT EXISTS audit_log (
  id       SERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id  INTEGER,
  action   TEXT NOT NULL,
  detail   TEXT NOT NULL DEFAULT ''
);
`;

/** Returns the database client, creating the tables on first use. */
export async function db(): Promise<Sql> {
  if (!globalForDb.__slcrSql) globalForDb.__slcrSql = connect();
  const sql = globalForDb.__slcrSql;
  if (!globalForDb.__slcrSchema) {
    globalForDb.__slcrSchema = sql.unsafe(SCHEMA).then(() => undefined);
    globalForDb.__slcrSchema.catch(() => {
      globalForDb.__slcrSchema = undefined;
    });
  }
  await globalForDb.__slcrSchema;
  return sql;
}
