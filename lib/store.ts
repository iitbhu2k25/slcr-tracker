import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry, User } from "./types";

/* ------------------------------------------------------------------ client */

const G = globalThis as unknown as { _slcrSb?: SupabaseClient };

/** Server-only Supabase client using the service-role key (bypasses RLS). Never import from client code. */
function sb(): SupabaseClient {
  if (G._slcrSb) return G._slcrSb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  G._slcrSb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return G._slcrSb;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

/* ------------------------------------------------------------------ row types + converters */

interface UserRow {
  id: number; username: string; password_hash: string; pw_version: number; role: "admin" | "staff";
  name: string; designation: string; emp_code: string; joined_on: string; email: string; phone: string;
  photo_version: number; has_photo: boolean; active: boolean; must_change_pw: boolean; created_at: string; last_login: string | null;
}

interface EntryRow {
  id: number; user_id: number; date: string; hours: number | string; location: string; category: string;
  status: string; title: string; work: string; outputs: string; next_plan: string; issues: string;
  created_at: string; updated_at: string; review_status: "" | "reviewed" | "revision"; review_remark: string;
  reviewed_at: string | null; reviewed_by: number | null;
}

// Everything except the photo blob (has_photo is a generated column).
const USER_COLS =
  "id,username,password_hash,pw_version,role,name,designation,emp_code,joined_on,email,phone,photo_version,has_photo,active,must_change_pw,created_at,last_login";

function toUser(u: UserRow): User {
  return {
    ...u,
    created_at: new Date(u.created_at),
    last_login: u.last_login ? new Date(u.last_login) : null,
  };
}

function toEntry(e: EntryRow): Entry {
  return {
    ...e,
    hours: Number(e.hours),
    created_at: new Date(e.created_at),
    updated_at: new Date(e.updated_at),
    reviewed_at: e.reviewed_at ? new Date(e.reviewed_at) : null,
  };
}

/* ------------------------------------------------------------------ users */

export async function findUserById(id: number): Promise<User | null> {
  const row = check(await sb().from("users").select(USER_COLS).eq("id", id).maybeSingle());
  return row ? toUser(row as unknown as UserRow) : null;
}

export type LoginRow = {
  id: number; password_hash: string; active: boolean; name: string; username: string; email: string;
  role: "admin" | "staff"; reset_hash: string | null; reset_expires: string | null;
};
const LOGIN_COLS = "id,password_hash,active,name,username,email,role,reset_hash,reset_expires";

export async function findUserByUsername(username: string): Promise<LoginRow | null> {
  return check(await sb().from("users").select(LOGIN_COLS).eq("username", username).maybeSingle()) as LoginRow | null;
}

/** Sign-in by email: only when exactly one account uses that address. */
export async function findUserByEmail(email: string): Promise<LoginRow | null> {
  const rows = check(await sb().from("users").select(LOGIN_COLS).ilike("email", email.replace(/[\\%_]/g, (c) => "\\" + c)).limit(2));
  return rows && rows.length === 1 ? (rows[0] as LoginRow) : null;
}

/** Stores a pending emailed one-time password. The current password keeps working until this one is used. */
export async function setPendingReset(id: number, hash: string, expires: Date): Promise<void> {
  check(await sb().from("users").update({ reset_hash: hash, reset_expires: expires.toISOString() }).eq("id", id));
}

export async function clearPendingReset(id: number): Promise<void> {
  check(await sb().from("users").update({ reset_hash: null, reset_expires: null }).eq("id", id));
}

export async function insertUser(data: { username: string; password_hash: string; role: "admin" | "staff"; name: string; designation: string; email?: string; must_change_pw: boolean }): Promise<number> {
  const row = check(await sb().from("users").insert(data).select("id").single());
  return (row as { id: number }).id;
}

export async function usernameExists(username: string): Promise<boolean> {
  const { count, error } = await sb().from("users").select("id", { count: "exact", head: true }).eq("username", username);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function updateUserLogin(id: number): Promise<void> {
  check(await sb().from("users").update({ last_login: new Date().toISOString() }).eq("id", id));
}

export async function updatePassword(id: number, hash: string, mustChange = false): Promise<void> {
  check(await sb().rpc("set_password", { p_id: id, p_hash: hash, p_must_change: mustChange }));
}

export async function updateProfile(id: number, data: { name: string; designation: string; emp_code: string; joined_on: string; email: string; phone: string }): Promise<void> {
  check(await sb().from("users").update(data).eq("id", id));
}

export async function setPhoto(id: number, photo: Buffer | null): Promise<void> {
  check(await sb().rpc("bump_photo", { p_id: id, p_photo: photo ? photo.toString("base64") : null }));
}

export async function getPhoto(id: number): Promise<Buffer | null> {
  const row = check(await sb().from("users").select("photo_b64").eq("id", id).maybeSingle());
  return row?.photo_b64 ? Buffer.from(row.photo_b64 as string, "base64") : null;
}

export async function toggleUserActive(id: number): Promise<void> {
  check(await sb().rpc("toggle_user_active", { p_id: id }));
}

export async function allUsers(): Promise<User[]> {
  const users = (check(await sb().from("users").select(USER_COLS)) as unknown as UserRow[]).map(toUser);
  return users.sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    if (a.active !== b.active) return b.active ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export async function staffUsers(includeInactive = false): Promise<User[]> {
  let q = sb().from("users").select(USER_COLS).eq("role", "staff");
  if (!includeInactive) q = q.eq("active", true);
  return (check(await q) as unknown as UserRow[]).map(toUser);
}

export async function adminExists(): Promise<boolean> {
  const { count, error } = await sb().from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getAllUserNames(): Promise<string[]> {
  return (check(await sb().from("users").select("name")) as { name: string }[]).map(u => u.name);
}

/* ------------------------------------------------------------------ entries */

export async function findEntryById(id: number): Promise<Entry | null> {
  const row = check(await sb().from("entries").select("*").eq("id", id).maybeSingle());
  return row ? toEntry(row as EntryRow) : null;
}

type EntryData = { date: string; hours: number; location: string; category: string; status: string; title: string; work: string; outputs: string; next_plan: string; issues: string };

export async function insertEntry(data: EntryData & { user_id: number }): Promise<void> {
  check(await sb().from("entries").insert(data));
}

export async function updateEntry(id: number, userId: number, data: EntryData): Promise<void> {
  check(await sb().from("entries").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId));
}

export async function deleteEntry(id: number, userId: number): Promise<void> {
  check(await sb().from("entries").delete().eq("id", id).eq("user_id", userId));
}

export async function entriesFor(userId: number, from?: string, to?: string): Promise<Entry[]> {
  let q = sb().from("entries").select("*").eq("user_id", userId);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  q = q.order("date", { ascending: false }).order("created_at", { ascending: false });
  return (check(await q) as EntryRow[]).map(toEntry);
}

export async function reviewEntry(id: number, decision: "reviewed" | "revision", remark: string, reviewedBy: number): Promise<void> {
  check(await sb().from("entries").update({
    review_status: decision, review_remark: remark, reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy,
  }).eq("id", id));
}

export async function getEntriesInRange(from: string, to: string): Promise<Entry[]> {
  return (check(await sb().from("entries").select("*").gte("date", from).lte("date", to)) as EntryRow[]).map(toEntry);
}

export async function allEntries(): Promise<Entry[]> {
  const rows = check(await sb().from("entries").select("*").order("date").order("id")) as EntryRow[];
  return rows.map(toEntry);
}

/* ------------------------------------------------------------------ login failures */

export async function recordLoginFailure(key: string): Promise<void> {
  check(await sb().from("login_failures").insert({ key }));
}

export async function countLoginFailures(key: string, lockoutMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  const { count, error } = await sb().from("login_failures").select("id", { count: "exact", head: true }).eq("key", key).gte("at", cutoff);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count ?? 0;
}

export async function cleanExpiredFailures(lockoutMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  check(await sb().from("login_failures").delete().lt("at", cutoff));
}

export async function clearLoginFailures(key: string): Promise<void> {
  check(await sb().from("login_failures").delete().eq("key", key));
}

export async function clearLoginFailuresByPrefix(prefix: string): Promise<void> {
  const escaped = prefix.replace(/[\\%_]/g, c => "\\" + c);
  check(await sb().from("login_failures").delete().like("key", `${escaped}%`));
}

/* ------------------------------------------------------------------ audit */

export async function insertAudit(userId: number | null, action: string, detail = ""): Promise<void> {
  check(await sb().from("audit_log").insert({ user_id: userId, action, detail: detail.slice(0, 500) }));
}

/* ------------------------------------------------------------------ backup */

export async function getBackupData() {
  const users = check(await sb().from("users").select("*")) as (UserRow & { photo_b64: string | null })[];
  const entries = check(await sb().from("entries").select("*").order("date").order("id"));
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    users: users.map(({ photo_b64, has_photo, password_hash, pw_version, ...u }) => ({ ...u, photo_jpeg_base64: photo_b64 })),
    entries,
  };
}
