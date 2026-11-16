/**
 * Seeds the Supabase database with the admin account and all roster staff.
 * Each new account gets a one-time temporary password and must_change_pw = true,
 * so the person is forced to set their own new password at first sign-in.
 *
 * Run:  npm run seed            (reads .env.local)
 *
 * Accounts that already exist are skipped, so it is safe to run again after adding
 * people to the roster. To issue a fresh one-time password to an existing person,
 * use "Reset password" on their page in the admin area.
 */
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function tempPassword() {
  const alpha = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let pw = "";
    for (let i = 0; i < 10; i++) pw += alpha[randomInt(alpha.length)];
    if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) return pw;
  }
}

// Keep in sync with ROSTER in lib/config.ts.
const ACCOUNTS = [
  { username: "admin",  name: "Principal Investigator",   designation: "Principal Investigator", role: "admin" },
  { username: "rajat",  name: "Mr. Rajat Saxena",          designation: "Young Professional",           role: "staff" },
  { username: "rajkc",  name: "Mr. Raj Kumar Choudhary",   designation: "Junior Research Fellow (JRF)", role: "staff" },
  { username: "gaurav", name: "Mr. Gaurav Kumar",           designation: "Scientific Assistant",         role: "staff" },
  { username: "anas",   name: "Mr. Mohd Anas Khan",         designation: "Project Associate 2",          role: "staff" },
  { username: "akash",  name: "Dr. Akash Tiwari",           designation: "Research Associate",           role: "staff" },
];

async function main() {
  const { data: existing, error } = await sb.from("users").select("username");
  if (error) {
    console.error(`✗ Could not read users table: ${error.message}\n  Did you run supabase/schema.sql in the Supabase SQL Editor?`);
    process.exit(1);
  }
  const taken = new Set(existing.map(u => u.username));

  const creds = [];
  for (const a of ACCOUNTS) {
    if (taken.has(a.username)) {
      console.log(`  – ${a.username} already exists, skipped`);
      continue;
    }
    const password = tempPassword();
    const { error: insErr } = await sb.from("users").insert({
      ...a,
      password_hash: await bcrypt.hash(password, 11),
      must_change_pw: true,
    });
    if (insErr) {
      console.error(`✗ ${a.username}: ${insErr.message}`);
      process.exit(1);
    }
    creds.push({ name: a.name, username: a.username, password });
  }

  if (!creds.length) {
    console.log("\nNothing to do: every account already exists.\n");
    return;
  }

  console.log("\n✓ Accounts created in Supabase. Each password works once: the person must set a new one at first sign-in.\n");
  const pad = Math.max(...creds.map(c => c.name.length));
  for (const c of creds) {
    console.log(`  ${c.name.padEnd(pad)}  username: ${c.username.padEnd(8)}  one-time password: ${c.password}`);
  }
  console.log("\nSave these now (they are not stored anywhere) and send each person only their own row.\n");
}

main().catch(err => { console.error(err); process.exit(1); });
