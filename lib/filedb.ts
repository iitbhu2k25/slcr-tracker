import "server-only";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Entry, User } from "./types";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "db.json");

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

const G = globalThis as unknown as { _slcrDb?: DbState; _slcrLock: Promise<void> };
if (!G._slcrLock) G._slcrLock = Promise.resolve();

function loadDb(): DbState {
  if (!existsSync(DB_PATH)) {
    return { users: [], entries: [], login_failures: [], audit_log: [], seq: { users: 0, entries: 0, audit: 0 } };
  }
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as DbState;
}

function getDb(): DbState {
  if (!G._slcrDb) G._slcrDb = loadDb();
  return G._slcrDb;
}

function saveDb(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(G._slcrDb!, null, 2), "utf-8");
}

async function write(fn: () => void): Promise<void> {
  const chain = G._slcrLock.then(() => { fn(); saveDb(); });
  G._slcrLock = chain.catch(() => {});
  await chain;
}

function nextId(seq: keyof DbState["seq"]): number {
  const db = getDb();
  db.seq[seq] += 1;
  return db.seq[seq];
}

function toUser(u: StoredUser): User {
  return {
    ...u,
    has_photo: u.photo_b64 !== null,
    created_at: new Date(u.created_at),
    last_login: u.last_login ? new Date(u.last_login) : null,
  };
}

function toEntry(e: StoredEntry): Entry {
  return {
    ...e,
    created_at: new Date(e.created_at),
    updated_at: new Date(e.updated_at),
    reviewed_at: e.reviewed_at ? new Date(e.reviewed_at) : null,
  };
}

// --- Users ---

export async function findUserById(id: number): Promise<User | null> {
  const u = getDb().users.find(u => u.id === id);
  return u ? toUser(u) : null;
}

export async function findUserByUsername(
  username: string,
): Promise<{ id: number; password_hash: string; active: boolean } | null> {
  const u = getDb().users.find(u => u.username === username);
  return u ? { id: u.id, password_hash: u.password_hash, active: u.active } : null;
}

export async function insertUser(data: {
  username: string;
  password_hash: string;
  role: "admin" | "staff";
  name: string;
  designation: string;
  must_change_pw: boolean;
}): Promise<number> {
  let id = 0;
  await write(() => {
    id = nextId("users");
    getDb().users.push({
      id, ...data,
      pw_version: 1, emp_code: "", joined_on: "", email: "", phone: "",
      photo_b64: null, photo_version: 0, active: true,
      created_at: new Date().toISOString(), last_login: null,
    });
  });
  return id;
}

export async function usernameExists(username: string): Promise<boolean> {
  return getDb().users.some(u => u.username === username);
}

export async function updateUserLogin(id: number): Promise<void> {
  await write(() => {
    const u = getDb().users.find(u => u.id === id);
    if (u) u.last_login = new Date().toISOString();
  });
}

export async function updatePassword(id: number, hash: string, mustChange = false): Promise<void> {
  await write(() => {
    const u = getDb().users.find(u => u.id === id);
    if (u) { u.password_hash = hash; u.must_change_pw = mustChange; u.pw_version += 1; }
  });
}

export async function updateProfile(id: number, data: {
  name: string; designation: string; emp_code: string; joined_on: string; email: string; phone: string;
}): Promise<void> {
  await write(() => {
    const u = getDb().users.find(u => u.id === id);
    if (u) Object.assign(u, data);
  });
}

export async function setPhoto(id: number, photo: Buffer | null): Promise<void> {
  await write(() => {
    const u = getDb().users.find(u => u.id === id);
    if (u) { u.photo_b64 = photo ? photo.toString("base64") : null; u.photo_version += 1; }
  });
}

export async function getPhoto(id: number): Promise<Buffer | null> {
  const u = getDb().users.find(u => u.id === id);
  return u?.photo_b64 ? Buffer.from(u.photo_b64, "base64") : null;
}

export async function toggleUserActive(id: number): Promise<void> {
  await write(() => {
    const u = getDb().users.find(u => u.id === id);
    if (u) u.active = !u.active;
  });
}

export async function allUsers(): Promise<User[]> {
  return getDb().users.map(toUser).sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    if (a.active !== b.active) return b.active ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export async function staffUsers(includeInactive = false): Promise<User[]> {
  return getDb().users
    .filter(u => u.role === "staff" && (includeInactive || u.active))
    .map(toUser);
}

export async function adminExists(): Promise<boolean> {
  return getDb().users.some(u => u.role === "admin");
}

export async function getAllUserNames(): Promise<string[]> {
  return getDb().users.map(u => u.name);
}

// --- Entries ---

export async function findEntryById(id: number): Promise<Entry | null> {
  const e = getDb().entries.find(e => e.id === id);
  return e ? toEntry(e) : null;
}

export async function insertEntry(data: {
  user_id: number; date: string; hours: number; location: string; category: string;
  status: string; title: string; work: string; outputs: string; next_plan: string; issues: string;
}): Promise<void> {
  await write(() => {
    const id = nextId("entries");
    const now = new Date().toISOString();
    getDb().entries.push({
      id, ...data, created_at: now, updated_at: now,
      review_status: "", review_remark: "", reviewed_at: null, reviewed_by: null,
    });
  });
}

export async function updateEntry(
  id: number, userId: number,
  data: {
    date: string; hours: number; location: string; category: string; status: string;
    title: string; work: string; outputs: string; next_plan: string; issues: string;
  },
): Promise<void> {
  await write(() => {
    const e = getDb().entries.find(e => e.id === id && e.user_id === userId);
    if (e) Object.assign(e, { ...data, updated_at: new Date().toISOString() });
  });
}

export async function deleteEntry(id: number, userId: number): Promise<void> {
  await write(() => {
    const db = getDb();
    db.entries = db.entries.filter(e => !(e.id === id && e.user_id === userId));
  });
}

export async function entriesFor(userId: number, from?: string, to?: string): Promise<Entry[]> {
  return getDb().entries
    .filter(e => e.user_id === userId && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1))
    .map(toEntry);
}

export async function reviewEntry(
  id: number, decision: "reviewed" | "revision", remark: string, reviewedBy: number,
): Promise<void> {
  await write(() => {
    const e = getDb().entries.find(e => e.id === id);
    if (e) {
      e.review_status = decision;
      e.review_remark = remark;
      e.reviewed_at = new Date().toISOString();
      e.reviewed_by = reviewedBy;
    }
  });
}

export async function allEntries(): Promise<StoredEntry[]> {
  return [...getDb().entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
  );
}

export async function getEntriesInRange(from: string, to: string): Promise<Entry[]> {
  return getDb().entries
    .filter(e => e.date >= from && e.date <= to)
    .map(toEntry);
}

// --- Login failures ---

export async function recordLoginFailure(key: string): Promise<void> {
  await write(() => { getDb().login_failures.push({ key, at: new Date().toISOString() }); });
}

export async function countLoginFailures(key: string, lockoutMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  return getDb().login_failures.filter(f => f.key === key && f.at >= cutoff).length;
}

export async function cleanExpiredFailures(lockoutMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  if (getDb().login_failures.some(f => f.at < cutoff)) {
    await write(() => {
      const db = getDb();
      db.login_failures = db.login_failures.filter(f => f.at >= cutoff);
    });
  }
}

export async function clearLoginFailures(key: string): Promise<void> {
  await write(() => {
    const db = getDb();
    db.login_failures = db.login_failures.filter(f => f.key !== key);
  });
}

export async function clearLoginFailuresByPrefix(prefix: string): Promise<void> {
  await write(() => {
    const db = getDb();
    db.login_failures = db.login_failures.filter(f => !f.key.startsWith(prefix));
  });
}

// --- Audit log ---

export async function insertAudit(userId: number | null, action: string, detail = ""): Promise<void> {
  await write(() => {
    const id = nextId("audit");
    getDb().audit_log.push({ id, at: new Date().toISOString(), user_id: userId, action, detail: detail.slice(0, 500) });
  });
}

// --- Backup ---

export function getBackupData() {
  const db = getDb();
  return {
    users: db.users.map(({ photo_b64, ...u }) => ({ ...u, photo_jpeg_base64: photo_b64 })),
    entries: db.entries,
  };
}
