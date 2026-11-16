import "server-only";
import { ROSTER } from "./config";
import {
  adminExists as _adminExists,
  allUsers as _allUsers,
  entriesFor as _entriesFor,
  staffUsers as _staffUsers,
} from "./store";
import type { Entry, PublicUser, User } from "./types";

export async function entriesFor(userId: number, from?: string, to?: string): Promise<Entry[]> {
  return _entriesFor(userId, from, to);
}

export async function staffUsers(includeInactive = false): Promise<User[]> {
  const users = await _staffUsers(includeInactive);
  const order = new Map(ROSTER.map((r, i) => [r.name.toLowerCase(), i]));
  return users.sort(
    (a, b) =>
      (order.get(a.name.toLowerCase()) ?? 99) - (order.get(b.name.toLowerCase()) ?? 99) ||
      a.name.localeCompare(b.name),
  );
}

export async function allUsers(): Promise<User[]> {
  return _allUsers();
}

export async function adminExists(): Promise<boolean> {
  return _adminExists();
}

/** Strip secrets before handing a user to a client component. */
export function publicUser(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, pw_version, ...rest } = u;
  return rest;
}
