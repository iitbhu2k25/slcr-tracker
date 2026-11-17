"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  audit, clearFailures, clientIp, createSession, destroySession, findUserById,
  hashPassword, isLockedOut, recordFailure, requireAdmin, requireStaff, requireUser,
  tempPassword, validatePassword, verifyPassword,
} from "@/lib/auth";
import { CATEGORIES, LEAVE_CATEGORY, LOCATIONS, LOCKOUT_MINUTES, ROSTER, STATUSES } from "@/lib/config";
import { adminExists } from "@/lib/data";
import {
  clearLoginFailuresByPrefix,
  deleteEntry,
  findEntryById,
  findUserByEmail,
  findUserByUsername,
  setPendingReset,
  clearPendingReset,
  getAllUserNames,
  insertEntry,
  insertUser as dbInsertUser,
  reviewEntry,
  setPhoto,
  toggleUserActive,
  updateEntry,
  updatePassword,
  updateProfile,
  updateUserLogin,
  usernameExists,
} from "@/lib/store";
import { isISODate, todayISO } from "@/lib/dates";
import { isValidEmail, sendCredentialsEmail } from "@/lib/mail";
import { safeNext, withMsg } from "@/lib/messages";
import type { Entry } from "@/lib/types";

export type FormState = { error?: string; errors?: string[]; values?: Record<string, string> };
export type Credentials = {
  name: string; username: string; password: string;
  email?: string; mail?: "sent" | "failed" | "none"; mailError?: string;
};
export type CredState = { error?: string; credentials?: Credentials[] };

const str = (fd: FormData, k: string, max = 4000) => String(fd.get(k) ?? "").trim().slice(0, max);

/* ------------------------------------------------------------------ setup & sign-in */

export async function setupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await adminExists()) redirect("/login");
  const expected = process.env.SETUP_KEY;
  if (!expected) return { error: "SETUP_KEY is not set in the environment variables. Add it and restart." };
  const values = { username: str(fd, "username", 40).toLowerCase(), name: str(fd, "name", 120) };
  if (str(fd, "setup_key", 200) !== expected) return { error: "The setup key is incorrect.", values };
  if (!/^[a-z0-9._]{2,40}$/.test(values.username)) return { error: "Usernames need at least 2 characters: letters, numbers, dots or underscores.", values };
  if (values.name.length < 3) return { error: "Enter your full name.", values };
  const pwError = validatePassword(String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (pwError) return { error: pwError, values };
  const hash = await hashPassword(String(fd.get("password")));
  const id = await dbInsertUser({ username: values.username, password_hash: hash, role: "admin", name: values.name, designation: "Principal Investigator", must_change_pw: false });
  const user = (await findUserById(id))!;
  await audit(user.id, "admin_created_via_setup");
  await createSession(user);
  redirect("/admin");
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const username = str(fd, "username", 120).toLowerCase();
  const password = String(fd.get("password") ?? "");
  const key = `${username}|${await clientIp()}`;
  if (await isLockedOut(key)) {
    return { error: `Too many failed attempts. Wait ${LOCKOUT_MINUTES} minutes and try again, or ask the administrator to reset your password.`, values: { username } };
  }
  const row = username.includes("@") ? await findUserByEmail(username) : await findUserByUsername(username);
  if (row && row.active) {
    let ok = await verifyPassword(password, row.password_hash);
    if (ok && row.reset_hash) await clearPendingReset(row.id); // they remembered it: cancel the emailed one
    if (!ok && row.reset_hash && row.reset_expires && new Date(row.reset_expires) > new Date()
        && (await verifyPassword(password, row.reset_hash))) {
      // Emailed one-time password: it becomes the password and must be changed right away.
      await updatePassword(row.id, row.reset_hash, true);
      await audit(row.id, "forgot_password_used");
      ok = true;
    }
    if (ok) {
      await clearFailures(key);
      await updateUserLogin(row.id);
      await audit(row.id, "login");
      await createSession((await findUserById(row.id))!);
      redirect("/");
    }
  }
  await recordFailure(key);
  return { error: "The username/email or password is incorrect.", values: { username } };
}

const FORGOT_MINUTES = 30;

/** Self-service reset: emails a one-time password. The reply never reveals whether an account exists. */
export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ident = str(fd, "username", 120).toLowerCase();
  if (!ident) return { error: "Enter your username or email." };
  const done: FormState = { values: { done: "1", username: ident } };
  const ipKey = `forgot|${await clientIp()}`;
  if (await isLockedOut(ipKey)) {
    return { error: `Too many requests. Wait ${LOCKOUT_MINUTES} minutes and try again.`, values: { username: ident } };
  }
  await recordFailure(ipKey); // counts requests per IP for rate limiting
  const row = ident.includes("@") ? await findUserByEmail(ident) : await findUserByUsername(ident);
  if (!row || !row.active || !row.email) return done;
  // At most one email per account every 2 minutes.
  if (row.reset_expires && new Date(row.reset_expires).getTime() - Date.now() > (FORGOT_MINUTES - 2) * 60000) return done;
  const password = tempPassword();
  await setPendingReset(row.id, await hashPassword(password), new Date(Date.now() + FORGOT_MINUTES * 60000));
  const r = await sendCredentialsEmail({
    to: row.email, name: row.name, username: row.username, password, role: row.role, forgotMinutes: FORGOT_MINUTES,
  });
  await audit(row.id, "forgot_password_requested", r.sent ? "emailed" : `email failed: ${r.error}`);
  return done;
}

export async function logoutAction() {
  await destroySession();
  redirect(withMsg("/login", "signedout"));
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser({ allowMustChange: true });
  const current = String(fd.get("current") ?? "");
  const pw = String(fd.get("new") ?? "");
  if (!(await verifyPassword(current, user.password_hash))) return { error: user.must_change_pw ? "The temporary password is incorrect." : "Your current password is incorrect." };
  if (current === pw) return { error: "Choose a password different from your current one." };
  const err = validatePassword(pw, String(fd.get("confirm") ?? ""));
  if (err) return { error: err };
  const hash = await hashPassword(pw);
  await updatePassword(user.id, hash, false);
  await audit(user.id, "password_changed");
  await createSession((await findUserById(user.id))!);
  redirect(withMsg(user.role === "admin" ? "/admin" : "/entry", "password"));
}

/* ------------------------------------------------------------------ staff entries */

function readEntry(fd: FormData) {
  const errors: string[] = [];
  const values: Record<string, string> = {};
  for (const k of ["date", "hours", "location", "category", "status", "title", "work", "outputs", "next_plan", "issues"]) {
    values[k] = String(fd.get(k) ?? "");
  }
  const date = values.date;
  if (!isISODate(date)) errors.push("Choose a valid date.");
  else if (date > todayISO()) errors.push("The date can't be in the future.");
  const hours = Math.round(Number(values.hours) * 10) / 10;
  if (!(values.hours.trim() !== "" && hours >= 0 && hours <= 24)) errors.push("Hours worked must be a number between 0 and 24.");
  if (!CATEGORIES.includes(values.category)) errors.push("Choose a work category.");
  if (!STATUSES.includes(values.status)) errors.push("Choose a task status.");
  const location = LOCATIONS.includes(values.location) ? values.location : LOCATIONS[0];
  const title = values.title.trim().slice(0, 140);
  const work = values.work.trim().slice(0, 4000);
  if (!title) errors.push("Add a short task title.");
  if (values.category !== LEAVE_CATEGORY && work.length < 15) errors.push("Describe the work carried out in a little more detail (at least 15 characters).");
  return {
    errors,
    values,
    data: {
      date, hours, location, category: values.category, status: values.status, title,
      work: work || "On leave",
      outputs: values.outputs.trim().slice(0, 2000),
      next_plan: values.next_plan.trim().slice(0, 2000),
      issues: values.issues.trim().slice(0, 2000),
    },
  };
}

export async function saveEntryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff();
  const { errors, values, data } = readEntry(fd);
  if (errors.length) return { errors, values };
  const editId = Number(fd.get("entry_id") || 0);
  if (editId) {
    const e = await findEntryById(editId);
    if (!e || e.user_id !== user.id) redirect("/my-progress");
    if (e.review_status === "reviewed") redirect(withMsg("/my-progress", "locked"));
    await updateEntry(editId, user.id, data);
    await audit(user.id, "entry_edited", String(editId));
    revalidatePath("/", "layout");
    redirect(withMsg("/my-progress", "saved"));
  }
  await insertEntry({ user_id: user.id, ...data });
  await audit(user.id, "entry_created", data.date);
  revalidatePath("/", "layout");
  redirect(withMsg("/entry", "submitted") + `&d=${data.date}`);
}

export async function deleteEntryAction(fd: FormData) {
  const user = await requireStaff();
  const id = Number(fd.get("entry_id") || 0);
  const e = await findEntryById(id);
  if (!e || e.user_id !== user.id) redirect("/my-progress");
  if (e.review_status) redirect(withMsg("/my-progress", "nodelete"));
  await deleteEntry(id, user.id);
  await audit(user.id, "entry_deleted", `${id} ${e.date}`);
  revalidatePath("/", "layout");
  redirect(withMsg("/my-progress", "deleted"));
}

/* ------------------------------------------------------------------ profile */

function decodePhoto(dataUrl: string): Buffer | null {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  // must be a JPEG (FF D8 FF) and a sensible size
  if (buf.length < 500 || buf.length > 400_000 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

export async function removePhotoAction() {
  const user = await requireUser();
  await setPhoto(user.id, null);
  await audit(user.id, "photo_removed");
  revalidatePath("/", "layout");
  redirect(withMsg("/profile", "photo_removed"));
}

export async function saveProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(fd, "name", 120);
  if (name.length < 3) return { error: "Enter your full name." };
  const joined = str(fd, "joined_on", 10);
  const photoData = String(fd.get("photo_data") ?? "");
  let photo: Buffer | null = null;
  if (photoData) {
    photo = decodePhoto(photoData);
    if (!photo) return { error: "That photo couldn't be used. Choose a JPG or PNG image and try again." };
  }
  await updateProfile(user.id, {
    name,
    designation: str(fd, "designation", 120),
    emp_code: str(fd, "emp_code", 60),
    joined_on: isISODate(joined) ? joined : "",
    email: str(fd, "email", 120),
    phone: str(fd, "phone", 30),
  });
  if (photo) await setPhoto(user.id, photo);
  await audit(user.id, "profile_updated");
  revalidatePath("/", "layout");
  redirect(withMsg("/profile", "profile"));
}

/* ------------------------------------------------------------------ admin: reviews */

export async function reviewAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("entry_id") || 0);
  const decision = String(fd.get("decision") ?? "");
  const back = safeNext(fd.get("next"), "/admin/log");
  const e = await findEntryById(id);
  if (!e || (decision !== "reviewed" && decision !== "revision")) redirect(back);
  const remark = fd.has("remark") ? str(fd, "remark", 2000) : (e as Entry).review_remark;
  if (decision === "revision" && !remark) redirect(withMsg(back, "needremark"));
  await reviewEntry(id, decision as "reviewed" | "revision", remark, admin.id);
  await audit(admin.id, "entry_reviewed", `${id} ${decision}`);
  revalidatePath("/", "layout");
  redirect(withMsg(back, decision));
}

/* ------------------------------------------------------------------ admin: accounts */

async function insertUserAccount(username: string, name: string, role: "admin" | "staff", designation: string, email = ""): Promise<Credentials | null> {
  if (await usernameExists(username)) return null;
  const password = tempPassword();
  await dbInsertUser({ username, password_hash: await hashPassword(password), role, name, designation, email, must_change_pw: true });
  return { name, username, password, email, mail: "none" };
}

/** Emails the credentials if the person has an address; records the outcome on the credentials. */
async function mailCredentials(c: Credentials, role: "admin" | "staff", reset = false): Promise<Credentials> {
  if (!c.email) return { ...c, mail: "none" };
  const r = await sendCredentialsEmail({ to: c.email, name: c.name, username: c.username, password: c.password, role, reset });
  return r.sent ? { ...c, mail: "sent" } : { ...c, mail: "failed", mailError: r.error };
}

export async function createUserAction(_prev: CredState, fd: FormData): Promise<CredState> {
  const admin = await requireAdmin();
  const username = str(fd, "username", 40).toLowerCase();
  const name = str(fd, "name", 120);
  const role = fd.get("role") === "admin" ? "admin" : "staff";
  const designation = role === "admin" && !fd.get("designation") ? "Administrator" : str(fd, "designation", 120);
  const email = str(fd, "email", 120).toLowerCase();
  if (!/^[a-z0-9._]{2,40}$/.test(username)) return { error: "Usernames need at least 2 characters: letters, numbers, dots or underscores." };
  if (name.length < 3) return { error: "Enter the person's full name." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address. The sign-in details are sent there." };
  const created = await insertUserAccount(username, name, role, designation, email);
  if (!created) return { error: `The username "${username}" is already taken.` };
  const cred = await mailCredentials(created, role);
  await audit(admin.id, "user_created", `${username} ${role} ${cred.mail === "sent" ? "emailed" : "not emailed"}`);
  revalidatePath("/", "layout");
  return { credentials: [cred] };
}

export async function createRosterAction(_prev: CredState): Promise<CredState> {
  const admin = await requireAdmin();
  const existingNames = new Set((await getAllUserNames()).map(n => n.trim().toLowerCase()));
  const created: Credentials[] = [];
  for (const r of ROSTER) {
    if (existingNames.has(r.name.toLowerCase())) continue;
    const cred = await insertUserAccount(r.username, r.name, "staff", r.designation);
    if (cred) created.push(cred);
  }
  if (!created.length) return { error: "Everyone on the roster already has an account." };
  await audit(admin.id, "roster_created", created.map(c => c.username).join(","));
  revalidatePath("/", "layout");
  return { credentials: created };
}

export async function updateUserAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("user_id") || 0);
  const target = await findUserById(id);
  if (!target) redirect("/admin/staff");
  const name = str(fd, "name", 120);
  const joined = str(fd, "joined_on", 10);
  if (name.length >= 3) {
    await updateProfile(id, {
      name,
      designation: str(fd, "designation", 120),
      emp_code: str(fd, "emp_code", 60),
      joined_on: isISODate(joined) ? joined : "",
      email: str(fd, "email", 120),
      phone: str(fd, "phone", 30),
    });
    await audit(admin.id, "user_updated", target.username);
  }
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/staff/${id}`, "details"));
}

export async function resetPasswordAction(_prev: CredState, fd: FormData): Promise<CredState> {
  const admin = await requireAdmin();
  const target = await findUserById(Number(fd.get("user_id") || 0));
  if (!target) return { error: "That account no longer exists." };
  const password = tempPassword();
  await updatePassword(target.id, await hashPassword(password), true);
  await clearLoginFailuresByPrefix(target.username + "|");
  const cred = await mailCredentials({ name: target.name, username: target.username, password, email: target.email }, target.role, true);
  await audit(admin.id, "password_reset", `${target.username} ${cred.mail === "sent" ? "emailed" : "not emailed"}`);
  return { credentials: [cred] };
}

export async function toggleActiveAction(fd: FormData) {
  const admin = await requireAdmin();
  const target = await findUserById(Number(fd.get("user_id") || 0));
  if (!target) redirect("/admin/staff");
  if (target.id === admin.id) redirect(withMsg(`/admin/staff/${target.id}`, "self"));
  await toggleUserActive(target.id);
  await audit(admin.id, target.active ? "user_deactivated" : "user_reactivated", target.username);
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/staff/${target.id}`, target.active ? "deactivated" : "reactivated"));
}
