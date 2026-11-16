/**
 * Generates data/db.json with an admin account and all roster staff.
 * Run once: node scripts/seed.mjs
 */
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "db.json");

function tempPassword() {
  const alpha = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let pw = "";
    for (let i = 0; i < 10; i++) pw += alpha[Math.floor(Math.random() * alpha.length)];
    if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) return pw;
  }
}

const ROSTER = [
  { username: "rajat",  name: "Mr. Rajat Saxena",           designation: "Young Professional" },
  { username: "rajkc",  name: "Mr. Raj Kumar Choudhary",    designation: "Junior Research Fellow (JRF)" },
  { username: "gaurav", name: "Mr. Gaurav Kumar",            designation: "Scientific Assistant" },
  { username: "anas",   name: "Mr. Mohd Anas Khan",          designation: "Project Associate 2" },
  { username: "akash",  name: "Dr. Akash Tiwari",            designation: "Research Associate" },
];

async function main() {
  if (existsSync(DB_PATH)) {
    console.log("⚠  data/db.json already exists. Delete it first if you want to reseed.");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const users = [];
  const creds = [];
  let seq = 0;

  // Admin account
  const adminPw = tempPassword();
  users.push({
    id: ++seq, username: "admin",
    password_hash: await bcrypt.hash(adminPw, 11),
    pw_version: 1, role: "admin",
    name: "Principal Investigator", designation: "Principal Investigator",
    emp_code: "", joined_on: "", email: "", phone: "",
    photo_b64: null, photo_version: 0, active: true, must_change_pw: true,
    created_at: now, last_login: null,
  });
  creds.push({ name: "Principal Investigator", username: "admin", password: adminPw });

  // Staff accounts
  for (const r of ROSTER) {
    const pw = tempPassword();
    users.push({
      id: ++seq, ...r,
      password_hash: await bcrypt.hash(pw, 11),
      pw_version: 1, role: "staff",
      emp_code: "", joined_on: "", email: "", phone: "",
      photo_b64: null, photo_version: 0, active: true, must_change_pw: true,
      created_at: now, last_login: null,
    });
    creds.push({ name: r.name, username: r.username, password: pw });
  }

  const db = {
    users,
    entries: [],
    login_failures: [],
    audit_log: [],
    seq: { users: seq, entries: 0, audit: 0 },
  };

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");

  console.log("\n✓ data/db.json created\n");
  console.log("All accounts use must_change_pw = true (forced password change on first login).\n");
  const pad = Math.max(...creds.map(c => c.name.length));
  for (const c of creds) {
    console.log(`  ${c.name.padEnd(pad)}  username: ${c.username.padEnd(8)}  temp password: ${c.password}`);
  }
  console.log("\nSave these credentials and send each person their own row.\n");
}

main().catch(err => { console.error(err); process.exit(1); });
