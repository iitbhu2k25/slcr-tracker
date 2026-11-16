PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL CHECK (role IN ('admin', 'staff')),
    name            TEXT    NOT NULL,
    designation     TEXT    NOT NULL DEFAULT '',
    emp_code        TEXT    NOT NULL DEFAULT '',
    joined_on       TEXT    NOT NULL DEFAULT '',
    email           TEXT    NOT NULL DEFAULT '',
    phone           TEXT    NOT NULL DEFAULT '',
    photo           TEXT    NOT NULL DEFAULT '',
    active          INTEGER NOT NULL DEFAULT 1,
    must_change_pw  INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL,
    last_login      TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date           TEXT    NOT NULL,
    hours          REAL    NOT NULL,
    location       TEXT    NOT NULL DEFAULT '',
    category       TEXT    NOT NULL,
    status         TEXT    NOT NULL,
    title          TEXT    NOT NULL,
    work           TEXT    NOT NULL,
    outputs        TEXT    NOT NULL DEFAULT '',
    next_plan      TEXT    NOT NULL DEFAULT '',
    issues         TEXT    NOT NULL DEFAULT '',
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    review_status  TEXT    NOT NULL DEFAULT '',   -- '', 'reviewed', 'revision'
    review_remark  TEXT    NOT NULL DEFAULT '',
    reviewed_at    TEXT    NOT NULL DEFAULT '',
    reviewed_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

CREATE TABLE IF NOT EXISTS login_failures (
    key         TEXT    NOT NULL,
    at          REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_failures_key ON login_failures(key);

CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT    NOT NULL,
    user_id   INTEGER,
    action    TEXT    NOT NULL,
    detail    TEXT    NOT NULL DEFAULT ''
);
