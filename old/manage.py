"""Command-line setup and maintenance for the SLCR Progress Tracker.

    python manage.py init                 create the database and the first administrator
    python manage.py init --with-roster   ... and staff accounts for everyone in config.ROSTER
    python manage.py add-user             add an administrator or staff account
    python manage.py reset-password NAME  give a user a new temporary password
    python manage.py list-users           show all accounts
    python manage.py backup               copy the database and photos to backups/
"""
import argparse
import datetime as dt
import getpass
import os
import shutil
import sqlite3
import sys

from werkzeug.security import generate_password_hash

import config
from app import BASE_DIR, DB_PATH, INSTANCE_DIR, UPLOAD_DIR, init_db, now_str, temp_password


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def ask_password(prompt="Password for this account: "):
    while True:
        pw = os.environ.get("SLCR_ADMIN_PASSWORD") or getpass.getpass(prompt)
        if len(pw) < config.MIN_PASSWORD_LENGTH or pw.isdigit() or pw.isalpha():
            print(f"  Use at least {config.MIN_PASSWORD_LENGTH} characters with letters and numbers.")
            if os.environ.get("SLCR_ADMIN_PASSWORD"):
                sys.exit(1)
            continue
        if os.environ.get("SLCR_ADMIN_PASSWORD") or pw == getpass.getpass("Repeat the password: "):
            return pw
        print("  The passwords don't match. Try again.")


def create_user(db, username, name, role, designation="", password=None, must_change=True):
    username = username.strip().lower()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        print(f"  Skipped: username '{username}' already exists.")
        return None
    pw = password or temp_password()
    db.execute("INSERT INTO users (username, password_hash, role, name, designation, must_change_pw, created_at) "
               "VALUES (?,?,?,?,?,?,?)",
               (username, generate_password_hash(pw), role, name, designation, int(must_change), now_str()))
    return pw


def cmd_init(args):
    fresh = not os.path.exists(DB_PATH)
    init_db()
    db = connect()
    print(f"Database ready: {DB_PATH}")
    if not db.execute("SELECT 1 FROM users WHERE role = 'admin'").fetchone():
        print("\nCreate the administrator (Principal Investigator) account.")
        username = args.admin_user or input("Admin username [pi]: ").strip() or "pi"
        name = args.admin_name or input("Admin full name [Principal Investigator]: ").strip() or "Principal Investigator"
        pw = ask_password()
        create_user(db, username, name, "admin", "Principal Investigator", pw, must_change=False)
        print(f"  Administrator '{username}' created.")
    elif not fresh:
        print("An administrator already exists; no changes made to accounts.")
    if args.with_roster:
        print("\nStaff accounts (temporary passwords - share each one privately; they must change it at first sign-in):")
        print(f"  {'Username':<10} {'Temporary password':<20} Name")
        for r in config.ROSTER:
            pw = create_user(db, r["username"], r["name"], "staff", r["designation"])
            if pw:
                print(f"  {r['username']:<10} {pw:<20} {r['name']}")
    db.commit()
    db.close()
    print("\nDone. Start the app with:  python app.py")


def cmd_add_user(args):
    db = connect()
    username = args.username or input("Username: ").strip()
    name = args.name or input("Full name with title: ").strip()
    role = args.role or (input("Role (staff/admin) [staff]: ").strip() or "staff")
    if role not in ("staff", "admin"):
        sys.exit("Role must be 'staff' or 'admin'.")
    designation = args.designation or input("Designation: ").strip()
    pw = create_user(db, username, name, role, designation)
    db.commit()
    if pw:
        print(f"Created {role} account '{username.lower()}'. Temporary password: {pw}")


def cmd_reset(args):
    db = connect()
    user = db.execute("SELECT * FROM users WHERE username = ?", (args.username,)).fetchone()
    if not user:
        sys.exit(f"No account with username '{args.username}'.")
    pw = temp_password()
    db.execute("UPDATE users SET password_hash = ?, must_change_pw = 1, active = 1 WHERE id = ?",
               (generate_password_hash(pw), user["id"]))
    db.execute("DELETE FROM login_failures WHERE key LIKE ?", (user["username"].lower() + "|%",))
    db.commit()
    print(f"New temporary password for '{user['username']}': {pw}")


def cmd_list(_args):
    db = connect()
    print(f"{'Username':<12} {'Role':<6} {'Active':<7} Name")
    for u in db.execute("SELECT * FROM users ORDER BY role, name"):
        print(f"{u['username']:<12} {u['role']:<6} {'yes' if u['active'] else 'no':<7} {u['name']}")


def cmd_backup(_args):
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(BASE_DIR, "backups", stamp)
    os.makedirs(dest, exist_ok=True)
    src = sqlite3.connect(DB_PATH)
    out = sqlite3.connect(os.path.join(dest, "tracker.db"))
    with out:
        src.backup(out)
    out.close()
    src.close()
    shutil.copytree(UPLOAD_DIR, os.path.join(dest, "uploads"), dirs_exist_ok=True)
    shutil.copy2(os.path.join(INSTANCE_DIR, "secret_key"), dest) if os.path.exists(
        os.path.join(INSTANCE_DIR, "secret_key")) else None
    print(f"Backup written to {dest}")


def main():
    p = argparse.ArgumentParser(description="SLCR Progress Tracker setup and maintenance")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("init", help="create the database and first administrator")
    s.add_argument("--with-roster", action="store_true", help="also create staff accounts from config.ROSTER")
    s.add_argument("--admin-user")
    s.add_argument("--admin-name")
    s.set_defaults(fn=cmd_init)
    s = sub.add_parser("add-user", help="add an account")
    s.add_argument("--username")
    s.add_argument("--name")
    s.add_argument("--role", choices=["staff", "admin"])
    s.add_argument("--designation")
    s.set_defaults(fn=cmd_add_user)
    s = sub.add_parser("reset-password", help="issue a new temporary password")
    s.add_argument("username")
    s.set_defaults(fn=cmd_reset)
    sub.add_parser("list-users", help="list accounts").set_defaults(fn=cmd_list)
    sub.add_parser("backup", help="back up database and photos").set_defaults(fn=cmd_backup)
    args = p.parse_args()
    if args.cmd != "init" and not os.path.exists(DB_PATH):
        sys.exit("No database yet. Run:  python manage.py init")
    args.fn(args)


if __name__ == "__main__":
    main()
