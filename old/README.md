# SLCR Progress Tracker

Daily progress tracking for the project **Decision Support System for Water Resource Management**,
Smart Laboratory on Clean Rivers (SLCR), IIT (BHU) Varanasi.

A self-hosted web application. It needs no internet services, no Claude account and no cloud
subscription: it runs on any Windows, Linux or macOS computer with Python, and all data stays in
one database file on that computer.

## What it does

**Staff** (each signs in with their own username and password)
- Log daily progress: date, hours, location, work category, task status, title, work carried out,
  outputs, plan for the next day, issues or support needed. Several entries per day are allowed.
- See only their own entries and the PI's remarks on them. They cannot see anyone else's records.
- Edit or delete their own entries until the PI reviews them. Reviewed entries are locked.
- Upload a profile photo, update their details, change their password.
- Download their own report as PDF or CSV, or open a print view.

**Administrator (PI)**
- Team overview: who reported today, hours this month, days reported, streaks, and a 14-day
  attendance strip for every staff member.
- Progress log with filters (person, dates, category, status, review state), hours-per-day chart and
  hours-by-category breakdown.
- Review each entry: *Mark reviewed* or *Request revision* with a remark the staff member sees.
- Reports for any staff member and any period: **PDF** (letterhead, photo, summary, working days
  without an entry, every entry with PI remarks, signature lines), a **print view** for the
  browser's print dialog, and **CSV** for Excel.
- Staff accounts: add people, reset passwords, deactivate leavers (their records are kept), and add
  a second administrator such as a Co-PI.

## Privacy and security

- Every page and download checks on the server who is signed in. A staff member asking for another
  person's entry, photo or report gets "not found". Automated tests in `tests/` check this.
- Passwords are stored as salted hashes, never in plain text. New accounts get a temporary password
  that must be changed at first sign-in. A password reset signs the person out everywhere.
- Repeated wrong passwords lock that username for 15 minutes (configurable in `config.py`).
- All forms are protected against cross-site request forgery; pages send strict security headers.
- An audit log records sign-ins, entry changes, reviews and account changes (`audit_log` table).

## Requirements

- Python 3.10 or newer (https://www.python.org/downloads/)
- About 50 MB of disk space, plus space for photos and records (small)

## Quick start on one computer

**Windows:** double-click `run_windows.bat`.
**Linux / macOS:** run `./run_linux.sh` in a terminal.

The first run installs the required packages, then asks you to create the administrator account
and prints a temporary password for each of the five staff in the roster:

```
Username   Temporary password   Name
rajat      ••••••••••           Mr. Rajat Saxena
rajk       ••••••••••           Mr. Raj Kumar
gaurav     ••••••••••           Mr. Gaurav Kumar
anas       ••••••••••           Mr. Anas
akash      ••••••••••           Dr. Akash Tiwar
```

Note these down and give each person their own username and password privately. Then open
http://127.0.0.1:8000 and sign in as the administrator.

### Manual setup (any platform)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate      Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py init --with-roster     # creates database, admin and staff accounts
python app.py                           # starts the app on http://127.0.0.1:8000
```

## Letting staff use it from their own computers

By default the app only accepts connections from the computer it runs on. To serve the lab:

### Option A: a lab computer on the campus network

Linux / macOS:

```bash
HOST=0.0.0.0 PORT=8000 python app.py
```

Windows (Command Prompt, inside the project folder with the environment activated):

```bat
set HOST=0.0.0.0
python app.py
```

Staff then open `http://<that-computer's-IP-address>:8000`. Allow port 8000 through the computer's
firewall, and keep the computer switched on during working hours.

### Option B: a Linux server with HTTPS (recommended for long-term use)

Ask the institute's computer centre for a server or virtual machine and, ideally, a hostname such as
`slcr-progress.iitbhu.ac.in` with an HTTPS certificate.

1. Copy the project to `/opt/slcr-tracker`, then:

   ```bash
   cd /opt/slcr-tracker
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   .venv/bin/python manage.py init --with-roster
   ```

2. Run it as a service (`/etc/systemd/system/slcr-tracker.service`):

   ```ini
   [Unit]
   Description=SLCR Progress Tracker
   After=network.target

   [Service]
   User=www-data
   WorkingDirectory=/opt/slcr-tracker
   Environment=HOST=127.0.0.1 PORT=8000 SLCR_SECURE_COOKIES=1
   ExecStart=/opt/slcr-tracker/.venv/bin/waitress-serve --host=127.0.0.1 --port=8000 --threads=8 app:app
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo chown -R www-data /opt/slcr-tracker/instance
   sudo systemctl enable --now slcr-tracker
   ```

3. Put nginx in front for HTTPS (`/etc/nginx/sites-available/slcr-tracker`):

   ```nginx
   server {
       listen 443 ssl;
       server_name slcr-progress.iitbhu.ac.in;
       ssl_certificate     /etc/ssl/certs/slcr.crt;
       ssl_certificate_key /etc/ssl/private/slcr.key;
       client_max_body_size 10m;
       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   server { listen 80; server_name slcr-progress.iitbhu.ac.in; return 301 https://$host$request_uri; }
   ```

   Set `SLCR_SECURE_COOKIES=1` (as above) whenever the app is served over HTTPS.

Do not expose the app on the open internet over plain HTTP: passwords would travel unencrypted.

## Backups

Everything lives in the `instance/` folder: `tracker.db` (all accounts and entries), `uploads/`
(photos) and `secret_key`.

```bash
python manage.py backup        # writes backups/<date-time>/ with the database and photos
```

Run it weekly (for example with Windows Task Scheduler or a cron job such as
`0 19 * * 5 cd /opt/slcr-tracker && .venv/bin/python manage.py backup`) and copy the `backups`
folder to another drive. To restore, stop the app and copy the backed-up files back into `instance/`.

## Everyday administration

| Task | Where |
|---|---|
| Add a staff member | Staff accounts → Add an account (or `python manage.py add-user`) |
| Someone forgot their password | Staff accounts → Manage → Reset password (or `python manage.py reset-password <username>`) |
| Administrator locked out | `python manage.py reset-password <admin-username>` on the server |
| Someone leaves the project | Staff accounts → Manage → Deactivate account |
| Add a Co-PI with full view | Staff accounts → Add an account → Role: Administrator |

## Customising

Edit `config.py` and restart the app to change the lab and project names, the roster, designations,
work categories, locations, task statuses, which weekdays count as working days, and the security
limits. Colours are in `static/style.css` (the `:root` block) and `static/print.css`.

## Known limitations

- The PDF uses the standard Helvetica font, so text typed in Hindi or another non-Latin script shows
  as boxes in the PDF. The **print view** and **CSV** display Hindi correctly; use the print view's
  "Save as PDF" for such reports.
- SQLite comfortably serves a lab of dozens of users. For hundreds of concurrent users, move to
  PostgreSQL.
- There is no email notification. Staff see the PI's remarks the next time they sign in.

## Project structure

```
app.py            web application: routes, access control, summaries, charts
reports.py        PDF and CSV report builders
manage.py         setup, accounts and backup commands
config.py         lab, project, roster and list settings
schema.sql        database tables
templates/        HTML pages
static/           stylesheet, print stylesheet, icon
tests/            automated checks (python tests/test_app.py)
instance/         created on first run: database, photos, secret key (keep private, back up)
```

## Running the tests

```bash
python tests/test_app.py
```

The tests create a throwaway database and check that staff cannot read or change each other's
entries, photos or reports, that admin pages are closed to staff, and that reviews, password
changes, lockouts and reports work.
