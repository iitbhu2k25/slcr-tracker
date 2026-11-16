import "server-only";
import type { Entry, User } from "./types";

/* ------------------------------------------------------------------ types */

interface StoredUser {
  id: number;
  username: string;
  password_hash: string;
  pw_version: number;
  role: "admin" | "staff";
  name: string;
  designation: string;
  emp_code: string;
  joined_on: string;
  email: string;
  phone: string;
  photo_b64: string | null;
  photo_version: number;
  active: boolean;
  must_change_pw: boolean;
  created_at: string;
  last_login: string | null;
}

interface StoredEntry {
  id: number;
  user_id: number;
  date: string;
  hours: number;
  location: string;
  category: string;
  status: string;
  title: string;
  work: string;
  outputs: string;
  next_plan: string;
  issues: string;
  created_at: string;
  updated_at: string;
  review_status: "" | "reviewed" | "revision";
  review_remark: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
}

interface DbState {
  users: StoredUser[];
  entries: StoredEntry[];
  login_failures: { key: string; at: string }[];
  audit_log: { id: number; at: string; user_id: number | null; action: string; detail: string }[];
  seq: { users: number; entries: number; audit: number };
}

const EMPTY_DB: DbState = { users: [], entries: [], login_failures: [], audit_log: [], seq: { users: 0, entries: 0, audit: 0 } };

/* ------------------------------------------------------------------ file storage */

async function dbPath(): Promise<string> {
  const { join } = await import("path");
  return join(process.cwd(), "data", "db.json");
}

async function readFromFile(): Promise<DbState> {
  const { /*turbopackIgnore: true*/ readFileSync, existsSync } = await import("fs");
  const p = await dbPath();
  if (!existsSync(p)) return EMPTY_DB;
  return JSON.parse(readFileSync(p, "utf-8")) as DbState;
}

async function writeToFile(db: DbState): Promise<void> {
  const { /*turbopackIgnore: true*/ writeFileSync, existsSync, mkdirSync } = await import("fs");
  const { join } = await import("path");
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "db.json"), JSON.stringify(db, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ in-memory cache + write lock */

const G = globalThis as unknown as { _slcrDb?: DbState; _slcrLock: Promise<void> };
if (!G._slcrLock) G._slcrLock = Promise.resolve();

async function ensureDb(): Promise<DbState> {
  if (!G._slcrDb) G._slcrDb = await readFromFile();
  return G._slcrDb;
}

async function write(fn: (db: DbState) => void): Promise<void> {
  const chain = G._slcrLock.then(async () => {
    G._slcrDb = await readFromFile();
    fn(G._slcrDb);
    await writeToFile(G._slcrDb);
  });
  G._slcrLock = chain.catch(() => {});
  await chain;
}

function nextId(db: DbState, seq: keyof DbState["seq"]): number {
  db.seq[seq] += 1;
  return db.seq[seq];
}

/* ------------------------------------------------------------------ converters */

function toUser(u: StoredUser): User {
  return { ...u, has_photo: u.photo_b64 !== null, created_at: new Date(u.created_at), last_login: u.last_login ? new Date(u.last_login) : null };
}

function toEntry(e: StoredEntry): Entry {
  return { ...e, created_at: new Date(e.created_at), updated_at: new Date(e.updated_at), reviewed_at: e.reviewed_at ? new Date(e.reviewed_at) : null };
}

/* ------------------------------------------------------------------ users */

export async function findUserById(id: number): Promise<User | null> {
  const db = await ensureDb();
  const u = db.users.find(u => u.id === id);
  return u ? toUser(u) : null;
}

export async function findUserByUsername(username: string): Promise<{ id: number; password_hash: string; active: boolean } | null> {
  const db = await ensureDb();
  const u = db.users.find(u => u.username === username);
  return u ? { id: u.id, password_hash: u.password_hash, active: u.active } : null;
}

export async function insertUser(data: { username: string; password_hash: string; role: "admin" | "staff"; name: string; designation: string; must_change_pw: boolean }): Promise<number> {
  let id = 0;
  await write(db => {
    id = nextId(db, "users");
    db.users.push({ id, ...data, pw_version: 1, emp_code: "", joined_on: "", email: "", phone: "", photo_b64: null, photo_version: 0, active: true, created_at: new Date().toISOString(), last_login: null });
  });
  return id;
}

export async function usernameExists(username: string): Promise<boolean> {
  const db = await ensureDb();
  return db.users.some(u => u.username === username);
}

export async function updateUserLogin(id: number): Promise<void> {
  await write(db => {
    const u = db.users.find(u => u.id === id);
    if (u) u.last_login = new Date().toISOString();
  });
}

export async function updatePassword(id: number, hash: string, mustChange = false): Promise<void> {
  await write(db => {
    const u = db.users.find(u => u.id === id);
    if (u) { u.password_hash = hash; u.must_change_pw = mustChange; u.pw_version += 1; }
  });
}

export async function updateProfile(id: number, data: { name: string; designation: string; emp_code: string; joined_on: string; email: string; phone: string }): Promise<void> {
  await write(db => {
    const u = db.users.find(u => u.id === id);
    if (u) Object.assign(u, data);
  });
}

export async function setPhoto(id: number, photo: Buffer | null): Promise<void> {
  await write(db => {
    const u = db.users.find(u => u.id === id);
    if (u) { u.photo_b64 = photo ? photo.toString("base64") : null; u.photo_version += 1; }
  });
}

export async function getPhoto(id: number): Promise<Buffer | null> {
  const db = await ensureDb();
  const u = db.users.find(u => u.id === id);
  return u?.photo_b64 ? Buffer.from(u.photo_b64, "base64") : null;
}

export async function toggleUserActive(id: number): Promise<void> {
  await write(db => {
    const u = db.users.find(u => u.id === id);
    if (u) u.active = !u.active;
  });
}

export async function allUsers(): Promise<User[]> {
  const db = await ensureDb();
  return db.users.map(toUser).sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    if (a.active !== b.active) return b.active ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export async function staffUsers(includeInactive = false): Promise<User[]> {
  const db = await ensureDb();
  return db.users.filter(u => u.role === "staff" && (includeInactive || u.active)).map(toUser);
}

export async function adminExists(): Promise<boolean> {
  const db = await ensureDb();
  return db.users.some(u => u.role === "admin");
}

export async function getAllUserNames(): Promise<string[]> {
  const db = await ensureDb();
  return db.users.map(u => u.name);
}

/* ------------------------------------------------------------------ entries */

export async function findEntryById(id: number): Promise<Entry | null> {
  const db = await ensureDb();
  const e = db.entries.find(e => e.id === id);
  return e ? toEntry(e) : null;
}

export async function insertEntry(data: { user_id: number; date: string; hours: number; location: string; category: string; status: string; title: string; work: string; outputs: string; next_plan: string; issues: string }): Promise<void> {
  await write(db => {
    const id = nextId(db, "entries");
    const now = new Date().toISOString();
    db.entries.push({ id, ...data, created_at: now, updated_at: now, review_status: "", review_remark: "", reviewed_at: null, reviewed_by: null });
  });
}

export async function updateEntry(id: number, userId: number, data: { date: string; hours: number; location: string; category: string; status: string; title: string; work: string; outputs: string; next_plan: string; issues: string }): Promise<void> {
  await write(db => {
    const e = db.entries.find(e => e.id === id && e.user_id === userId);
    if (e) Object.assign(e, { ...data, updated_at: new Date().toISOString() });
  });
}

export async function deleteEntry(id: number, userId: number): Promise<void> {
  await write(db => { db.entries = db.entries.filter(e => !(e.id === id && e.user_id === userId)); });
}

export async function entriesFor(userId: number, from?: string, to?: string): Promise<Entry[]> {
  const db = await ensureDb();
  return db.entries
    .filter(e => e.user_id === userId && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1))
    .map(toEntry);
}

export async function reviewEntry(id: number, decision: "reviewed" | "revision", remark: string, reviewedBy: number): Promise<void> {
  await write(db => {
    const e = db.entries.find(e => e.id === id);
    if (e) { e.review_status = decision; e.review_remark = remark; e.reviewed_at = new Date().toISOString(); e.reviewed_by = reviewedBy; }
  });
}

export async function getEntriesInRange(from: string, to: string): Promise<Entry[]> {
  const db = await ensureDb();
  return db.entries.filter(e => e.date >= from && e.date <= to).map(toEntry);
}

export async function allEntries(): Promise<StoredEntry[]> {
  const db = await ensureDb();
  return [...db.entries].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
}

/* ------------------------------------------------------------------ login failures */

export async function recordLoginFailure(key: string): Promise<void> {
  await write(db => { db.login_failures.push({ key, at: new Date().toISOString() }); });
}

export async function countLoginFailures(key: string, lockoutMinutes: number): Promise<number> {
  const db = await ensureDb();
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  return db.login_failures.filter(f => f.key === key && f.at >= cutoff).length;
}

export async function cleanExpiredFailures(lockoutMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  const db = await ensureDb();
  if (db.login_failures.some(f => f.at < cutoff)) {
    await write(db => { db.login_failures = db.login_failures.filter(f => f.at >= cutoff); });
  }
}

export async function clearLoginFailures(key: string): Promise<void> {
  await write(db => { db.login_failures = db.login_failures.filter(f => f.key !== key); });
}

export async function clearLoginFailuresByPrefix(prefix: string): Promise<void> {
  await write(db => { db.login_failures = db.login_failures.filter(f => !f.key.startsWith(prefix)); });
}

/* ------------------------------------------------------------------ audit */

export async function insertAudit(userId: number | null, action: string, detail = ""): Promise<void> {
  await write(db => {
    const id = nextId(db, "audit");
    db.audit_log.push({ id, at: new Date().toISOString(), user_id: userId, action, detail: detail.slice(0, 500) });
  });
}

/* ------------------------------------------------------------------ backup */

export async function getBackupData() {
  const db = await ensureDb();
  return {
    users: db.users.map(({ photo_b64, ...u }) => ({ ...u, photo_jpeg_base64: photo_b64 })),
    entries: db.entries,
  };
}
