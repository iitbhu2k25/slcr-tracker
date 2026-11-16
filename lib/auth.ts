import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomInt } from "crypto";
import { LOCKOUT_MINUTES, MAX_LOGIN_FAILURES, MIN_PASSWORD_LENGTH, SESSION_HOURS } from "./config";
import {
  findUserById as _findUserById,
  recordLoginFailure, countLoginFailures, cleanExpiredFailures,
  clearLoginFailures as _clearLoginFailures, insertAudit,
} from "./filedb";
import type { User } from "./types";

const COOKIE = "slcr_session";

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  return new TextEncoder().encode(s);
}

export async function findUserById(id: number): Promise<User | null> {
  return _findUserById(id);
}

export async function createSession(user: User) {
  const token = await new SignJWT({ uid: user.id, pv: user.pw_version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user for this request, or null. Checks the account is active and the password unchanged. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const user = await _findUserById(Number(payload.uid));
    if (!user || !user.active || user.pw_version !== Number(payload.pv)) return null;
    return user;
  } catch {
    return null;
  }
});

export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.must_change_pw && !opts.allowMustChange) redirect("/password");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/entry");
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "staff") redirect("/admin");
  return user;
}

/** For route handlers: the user or null, without redirects. Must-change-password users get nothing. */
export async function apiUser(): Promise<User | null> {
  const user = await currentUser();
  return user && !user.must_change_pw ? user : null;
}

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}
export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function validatePassword(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw !== confirm) return "The two passwords don't match.";
  if (/^\d+$/.test(pw) || /^[A-Za-z]+$/.test(pw)) return "Use a mix of letters and numbers.";
  return null;
}

export function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let pw = "";
    for (let i = 0; i < 10; i++) pw += alphabet[randomInt(alphabet.length)];
    if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) return pw;
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "?";
}

export async function isLockedOut(key: string): Promise<boolean> {
  await cleanExpiredFailures(LOCKOUT_MINUTES);
  const n = await countLoginFailures(key, LOCKOUT_MINUTES);
  return n >= MAX_LOGIN_FAILURES;
}

export async function recordFailure(key: string): Promise<void> {
  await recordLoginFailure(key);
}

export async function clearFailures(key: string): Promise<void> {
  await _clearLoginFailures(key);
}

export async function audit(userId: number | null, action: string, detail = ""): Promise<void> {
  await insertAudit(userId, action, detail);
}
