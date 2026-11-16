
import datetime as dt
import functools
import os
import secrets
import sqlite3
import time
from urllib.parse import urlparse

from flask import (Flask, Response, abort, flash, g, redirect, render_template,
                   request, send_from_directory, session, url_for)
from markupsafe import Markup
from PIL import Image, ImageOps
from werkzeug.security import check_password_hash, generate_password_hash

import config

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INSTANCE_DIR = os.environ.get("SLCR_INSTANCE_DIR", os.path.join(BASE_DIR, "instance"))
UPLOAD_DIR = os.path.join(INSTANCE_DIR, "uploads")
DB_PATH = os.path.join(INSTANCE_DIR, "tracker.db")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _secret_key():
    path = os.path.join(INSTANCE_DIR, "secret_key")
    if os.environ.get("SLCR_SECRET_KEY"):
        return os.environ["SLCR_SECRET_KEY"]
    if not os.path.exists(path):
        with open(path, "w") as fh:
            fh.write(secrets.token_hex(32))
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    with open(path) as fh:
        return fh.read().strip()


app = Flask(__name__)
app.config.update(
    SECRET_KEY=_secret_key(),
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SLCR_SECURE_COOKIES", "0") == "1",
    PERMANENT_SESSION_LIFETIME=dt.timedelta(hours=config.SESSION_HOURS),
)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=15)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def _close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    with open(os.path.join(BASE_DIR, "schema.sql")) as fh:
        db.executescript(fh.read())
    db.execute("PRAGMA journal_mode = WAL")
    db.commit()
    db.close()


def now_str():
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def audit(action, detail=""):
    uid = g.user["id"] if g.get("user") else None
    get_db().execute("INSERT INTO audit_log (at, user_id, action, detail) VALUES (?,?,?,?)",
                     (now_str(), uid, action, detail[:500]))


# --------------------------------------------------------------------------
# Dates and summaries
# --------------------------------------------------------------------------
def today():
    return dt.date.today()


def parse_date(value, default=None):
    try:
        return dt.date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return default


PRESETS = [("week", "This week"), ("month", "This month"), ("last", "Last month"),
           ("30", "Last 30 days"), ("90", "Last 90 days")]


def preset_range(name):
    t = today()
    if name == "week":
        return t - dt.timedelta(days=t.weekday()), t
    if name == "last":
        first_this = t.replace(day=1)
        last_prev = first_this - dt.timedelta(days=1)
        return last_prev.replace(day=1), last_prev
    if name == "30":
        return t - dt.timedelta(days=29), t
    if name == "90":
        return t - dt.timedelta(days=89), t
    return t.replace(day=1), t


def range_from_request():
    """Read ?preset= or ?from=&to= ; returns (from, to, preset)."""
    preset = request.args.get("preset", "")
    frm = parse_date(request.args.get("from"))
    to = parse_date(request.args.get("to"))
    if frm and to and not preset:
        if frm > to:
            frm, to = to, frm
        return frm, to, "custom"
    preset = preset if preset in dict(PRESETS) else "month"
    frm, to = preset_range(preset)
    return frm, to, preset


def daterange(frm, to):
    d = frm
    while d <= to:
        yield d
        d += dt.timedelta(days=1)


def is_workday(d):
    return d.weekday() in config.WORKING_WEEKDAYS


def fmt_hours(value):
    v = round(float(value or 0), 1)
    return str(int(v)) if v == int(v) else f"{v:.1f}"


def needs_review(e):
    if not e["review_status"]:
        return True
    return e["review_status"] == "revision" and e["updated_at"] > e["reviewed_at"]


def summarize(entries, frm, to):
    entries = [e for e in entries if frm.isoformat() <= e["date"] <= to.isoformat()]
    dates = {e["date"] for e in entries}
    leave_dates = {e["date"] for e in entries if e["category"] == config.LEAVE_CATEGORY}
    end = min(to, today())
    workdays = [d for d in daterange(frm, end) if is_workday(d)] if frm <= end else []
    missing = [d for d in workdays if d.isoformat() not in dates]
    hours = sum(float(e["hours"] or 0) for e in entries)
    by_cat, by_status = {}, {}
    for e in entries:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + float(e["hours"] or 0)
        by_status[e["status"]] = by_status.get(e["status"], 0) + 1
    reported_workdays = len(dates) - len(leave_dates)
    return {
        "entries": entries,
        "days_reported": len(dates),
        "leave_days": len(leave_dates),
        "working_days": len(workdays),
        "missing": missing,
        "hours": hours,
        "avg": hours / reported_workdays if reported_workdays > 0 else 0,
        "by_cat": sorted(by_cat.items(), key=lambda kv: -kv[1]),
        "by_status": by_status,
        "tasks": len(entries),
        "completed": by_status.get("Completed", 0),
        "reviewed": sum(1 for e in entries if e["review_status"] == "reviewed"),
        "revision": sum(1 for e in entries if e["review_status"] == "revision"),
    }


def streak(entries):
    have = {e["date"] for e in entries}
    d = today()
    if d.isoformat() not in have:
        d -= dt.timedelta(days=1)
    n = 0
    for _ in range(400):
        if is_workday(d):
            if d.isoformat() in have:
                n += 1
            else:
                break
        d -= dt.timedelta(days=1)
    return n


def entries_for(user_id, frm=None, to=None):
    sql = "SELECT * FROM entries WHERE user_id = ?"
    args = [user_id]
    if frm:
        sql += " AND date >= ?"
        args.append(frm.isoformat())
    if to:
        sql += " AND date <= ?"
        args.append(to.isoformat())
    sql += " ORDER BY date DESC, created_at DESC"
    return get_db().execute(sql, args).fetchall()


def staff_users(include_inactive=False):
    sql = "SELECT * FROM users WHERE role = 'staff'"
    if not include_inactive:
        sql += " AND active = 1"
    rows = get_db().execute(sql).fetchall()
    order = {r["name"].lower(): i for i, r in enumerate(config.ROSTER)}
    return sorted(rows, key=lambda u: (order.get(u["name"].lower(), 99), u["name"].lower()))


# --------------------------------------------------------------------------
# Charts (server-rendered SVG)
# --------------------------------------------------------------------------
def daily_chart(entries, frm, to):
    days = list(daterange(frm, to))
    by = {}
    for e in entries:
        by[e["date"]] = by.get(e["date"], 0) + float(e["hours"] or 0)
    top = max([8] + list(by.values()))
    top = -(-top // 4) * 4
    bw = max(6, min(22, 560 // max(1, len(days)) - 2))
    gap, left, height, bottom = 2, 30, 150, 22
    width = left + len(days) * (bw + gap) + 8
    parts = []
    for i in range(5):
        v = top * i / 4
        y = height - bottom - (height - bottom - 8) * (v / top)
        parts.append(f'<line class="grid" x1="{left}" x2="{width}" y1="{y:.1f}" y2="{y:.1f}"/>'
                     f'<text x="{left - 6}" y="{y + 3:.1f}" text-anchor="end">{fmt_hours(v)}</text>')
    for i, d in enumerate(days):
        v = by.get(d.isoformat(), 0)
        x = left + i * (bw + gap)
        h = (height - bottom - 8) * (v / top)
        if v > 0:
            cls = "bar" if is_workday(d) else "bar wk"
            parts.append(f'<rect class="{cls}" x="{x}" y="{height - bottom - h:.1f}" width="{bw}" '
                         f'height="{h:.1f}" rx="1.5"><title>{d.strftime("%a, %d %b %Y")}: '
                         f'{fmt_hours(v)} h</title></rect>')
        edge = i in (0, len(days) - 1)
        periodic = (d.weekday() == 0 if len(days) <= 31 else d.day == 1)
        near_edge = i < 3 or i > len(days) - 4
        if edge or (periodic and not near_edge):
            parts.append(f'<text x="{x + bw / 2:.1f}" y="{height - 6}" text-anchor="middle">'
                         f'{d.day} {d.strftime("%b")}</text>')
    return Markup(f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" '
                  f'aria-label="Hours logged per day">{"".join(parts)}</svg>')


# --------------------------------------------------------------------------
# Template helpers
# --------------------------------------------------------------------------
@app.template_filter("fdate")
def _fdate(value):
    d = parse_date(value) if not isinstance(value, dt.date) else value
    return d.strftime("%d %b %Y").lstrip("0") if d else ""


@app.template_filter("fday")
def _fday(value):
    d = parse_date(value) if not isinstance(value, dt.date) else value
    return f"{d.strftime('%a')}, {d.day} {d.strftime('%b %Y')}" if d else ""


@app.template_filter("flong")
def _flong(value):
    return f"{value.strftime('%A')}, {value.day} {value.strftime('%B %Y')}"


@app.template_filter("fstamp")
def _fstamp(value):
    try:
        d = dt.datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return ""
    return f"{d.day} {d.strftime('%b %Y, %H:%M')}"


@app.template_filter("hrs")
def _hrs(value):
    return fmt_hours(value)


@app.template_filter("initials")
def _initials(name):
    words = [w for w in str(name or "").split() if w.rstrip(".").lower() not in {"mr", "mrs", "ms", "dr", "prof"}]
    return ((words[0][0] if words else "?") + (words[1][0] if len(words) > 1 else "")).upper()


def is_late(e):
    return e["created_at"][:10] > (parse_date(e["date"]) + dt.timedelta(days=1)).isoformat()


@app.context_processor
def _inject():
    return {
        "cfg": config,
        "me": g.get("user"),
        "csrf_token": session.get("csrf", ""),
        "today": today(),
        "PRESETS": PRESETS,
        "is_late": is_late,
        "needs_review": needs_review,
        "group_entries": group_by_day,
    }


# --------------------------------------------------------------------------
# Authentication, CSRF and access control
# --------------------------------------------------------------------------
def pw_marker(user):
    return user["password_hash"][-16:]


@app.before_request
def _load_user():
    g.user = None
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    uid = session.get("uid")
    if uid:
        user = get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if user and user["active"] and session.get("pw") == pw_marker(user):
            g.user = user
        else:
            session.pop("uid", None)
    if request.method == "POST":
        sent = request.form.get("csrf_token", "")
        if not sent or not secrets.compare_digest(sent, session.get("csrf", "")):
            abort(400, "Your session expired. Go back, reload the page and try again.")
    if (g.user and g.user["must_change_pw"]
            and request.endpoint not in ("change_password", "logout", "static")):
        return redirect(url_for("change_password"))


@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; form-action 'self'; frame-ancestors 'none'")
    if g.get("user"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def login_required(view):
    @functools.wraps(view)
    def wrapped(*a, **kw):
        if not g.user:
            return redirect(url_for("login", next=request.full_path))
        return view(*a, **kw)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    @login_required
    def wrapped(*a, **kw):
        if g.user["role"] != "admin":
            abort(403)
        return view(*a, **kw)
    return wrapped


def staff_required(view):
    @functools.wraps(view)
    @login_required
    def wrapped(*a, **kw):
        if g.user["role"] != "staff":
            return redirect(url_for("admin_overview"))
        return view(*a, **kw)
    return wrapped


def safe_next(target, fallback):
    if target:
        p = urlparse(target)
        if not p.scheme and not p.netloc and target.startswith("/"):
            return target
    return fallback


def client_ip():
    return request.remote_addr or "?"


def locked_out(key):
    db = get_db()
    cutoff = time.time() - config.LOCKOUT_MINUTES * 60
    db.execute("DELETE FROM login_failures WHERE at < ?", (cutoff,))
    n = db.execute("SELECT COUNT(*) FROM login_failures WHERE key = ?", (key,)).fetchone()[0]
    db.commit()
    return n >= config.MAX_LOGIN_FAILURES


def validate_password(pw, pw2):
    if len(pw) < config.MIN_PASSWORD_LENGTH:
        return f"Use at least {config.MIN_PASSWORD_LENGTH} characters."
    if pw != pw2:
        return "The two passwords don't match."
    if pw.isdigit() or pw.isalpha():
        return "Use a mix of letters and numbers."
    return None


@app.route("/login", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("home"))
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        key = f"{username.lower()}|{client_ip()}"
        db = get_db()
        if locked_out(key):
            error = (f"Too many failed attempts. Wait {config.LOCKOUT_MINUTES} minutes and try again, "
                     "or ask the administrator to reset your password.")
        else:
            user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if user and user["active"] and check_password_hash(user["password_hash"], password):
                session.clear()
                session.permanent = True
                session["uid"] = user["id"]
                session["pw"] = pw_marker(user)
                session["csrf"] = secrets.token_urlsafe(32)
                db.execute("DELETE FROM login_failures WHERE key = ?", (key,))
                db.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_str(), user["id"]))
                g.user = user
                audit("login")
                db.commit()
                return redirect(safe_next(request.args.get("next"), url_for("home")))
            db.execute("INSERT INTO login_failures (key, at) VALUES (?, ?)", (key, time.time()))
            db.commit()
            error = "The username or password is incorrect."
    return render_template("login.html", error=error)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have signed out.", "ok")
    return redirect(url_for("login"))


@app.route("/password", methods=["GET", "POST"])
@login_required
def change_password():
    error = None
    if request.method == "POST":
        current = request.form.get("current", "")
        pw, pw2 = request.form.get("new", ""), request.form.get("confirm", "")
        if not check_password_hash(g.user["password_hash"], current):
            error = "Your current password is incorrect."
        elif current == pw:
            error = "Choose a password different from your current one."
        else:
            error = validate_password(pw, pw2)
        if not error:
            new_hash = generate_password_hash(pw)
            db = get_db()
            db.execute("UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?",
                       (new_hash, g.user["id"]))
            audit("password_changed")
            db.commit()
            session["pw"] = new_hash[-16:]
            flash("Your password has been changed.", "ok")
            return redirect(url_for("home"))
    return render_template("change_password.html", error=error, forced=bool(g.user["must_change_pw"]))


@app.route("/")
@login_required
def home():
    return redirect(url_for("admin_overview" if g.user["role"] == "admin" else "staff_entry"))


# --------------------------------------------------------------------------
# Photos
# --------------------------------------------------------------------------
def save_photo(user_id, file_storage):
    try:
        img = Image.open(file_storage.stream)
        img.verify()
        file_storage.stream.seek(0)
        img = Image.open(file_storage.stream)
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise ValueError("That file isn't an image the app can read. Use a JPG or PNG photo.")
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((360, 360), Image.LANCZOS)
    name = f"u{user_id}_{secrets.token_hex(6)}.jpg"
    img.save(os.path.join(UPLOAD_DIR, name), "JPEG", quality=86, optimize=True)
    return name


def remove_photo_file(name):
    if name and "/" not in name and "\\" not in name:
        try:
            os.remove(os.path.join(UPLOAD_DIR, name))
        except OSError:
            pass


@app.route("/photo/<int:user_id>")
@login_required
def photo(user_id):
    if g.user["role"] != "admin" and g.user["id"] != user_id:
        abort(404)
    user = get_db().execute("SELECT photo FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["photo"]:
        abort(404)
    resp = send_from_directory(UPLOAD_DIR, user["photo"], mimetype="image/jpeg")
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp


# --------------------------------------------------------------------------
# Staff pages
# --------------------------------------------------------------------------
def read_entry_form(form):
    errors = []
    d = parse_date(form.get("date"))
    if not d:
        errors.append("Choose a valid date.")
    elif d > today():
        errors.append("The date can't be in the future.")
    try:
        hours = round(float(form.get("hours", "")), 1)
        if not 0 <= hours <= 24:
            raise ValueError
    except ValueError:
        hours = 0
        errors.append("Hours worked must be a number between 0 and 24.")
    category = form.get("category", "")
    if category not in config.CATEGORIES:
        errors.append("Choose a work category.")
    status = form.get("status", "")
    if status not in config.STATUSES:
        errors.append("Choose a task status.")
    location = form.get("location", "")
    if location not in config.LOCATIONS:
        location = config.LOCATIONS[0]
    title = form.get("title", "").strip()[:140]
    work = form.get("work", "").strip()[:4000]
    if not title:
        errors.append("Add a short task title.")
    if category != config.LEAVE_CATEGORY and len(work) < 15:
        errors.append("Describe the work carried out in a little more detail (at least 15 characters).")
    data = {
        "date": d.isoformat() if d else "", "hours": hours, "location": location,
        "category": category, "status": status, "title": title,
        "work": work or "On leave",
        "outputs": form.get("outputs", "").strip()[:2000],
        "next_plan": form.get("next_plan", "").strip()[:2000],
        "issues": form.get("issues", "").strip()[:2000],
    }
    return data, errors


@app.route("/entry", methods=["GET", "POST"])
@staff_required
def staff_entry():
    form = {"date": today().isoformat(), "hours": "8", "location": config.LOCATIONS[0],
            "category": config.CATEGORIES[0], "status": "Completed"}
    errors = []
    if request.method == "POST":
        data, errors = read_entry_form(request.form)
        if not errors:
            ts = now_str()
            db = get_db()
            db.execute(
                "INSERT INTO entries (user_id, date, hours, location, category, status, title, work, "
                "outputs, next_plan, issues, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (g.user["id"], data["date"], data["hours"], data["location"], data["category"],
                 data["status"], data["title"], data["work"], data["outputs"], data["next_plan"],
                 data["issues"], ts, ts))
            audit("entry_created", data["date"])
            db.commit()
            flash(f"Entry submitted for {_fdate(data['date'])}.", "ok")
            return redirect(url_for("staff_entry"))
        form = dict(request.form)
    return render_staff_entry(form, errors, editing=None)


def render_staff_entry(form, errors, editing):
    all_entries = entries_for(g.user["id"])
    m_from, m_to = preset_range("month")
    return render_template(
        "staff_entry.html", form=form, errors=errors, editing=editing,
        month=summarize(all_entries, m_from, m_to), streak=streak(all_entries),
        recent=all_entries[:4],
        done_today=any(e["date"] == today().isoformat() for e in all_entries),
        revisions=[e for e in all_entries if e["review_status"] == "revision"
                   and e["updated_at"] <= e["reviewed_at"]])


def own_entry(entry_id):
    e = get_db().execute("SELECT * FROM entries WHERE id = ? AND user_id = ?",
                         (entry_id, g.user["id"])).fetchone()
    if not e:
        abort(404)
    return e


@app.route("/entry/<int:entry_id>/edit", methods=["GET", "POST"])
@staff_required
def staff_edit(entry_id):
    e = own_entry(entry_id)
    if e["review_status"] == "reviewed":
        flash("This entry has been reviewed by the PI and can no longer be changed.", "warn")
        return redirect(url_for("staff_history"))
    errors = []
    form = dict(e)
    if request.method == "POST":
        data, errors = read_entry_form(request.form)
        if not errors:
            db = get_db()
            db.execute(
                "UPDATE entries SET date=?, hours=?, location=?, category=?, status=?, title=?, work=?, "
                "outputs=?, next_plan=?, issues=?, updated_at=? WHERE id=? AND user_id=?",
                (data["date"], data["hours"], data["location"], data["category"], data["status"],
                 data["title"], data["work"], data["outputs"], data["next_plan"], data["issues"],
                 now_str(), entry_id, g.user["id"]))
            audit("entry_edited", str(entry_id))
            db.commit()
            flash("Your changes have been saved.", "ok")
            return redirect(url_for("staff_history"))
        form = dict(request.form)
    return render_staff_entry(form, errors, editing=e)


@app.route("/entry/<int:entry_id>/delete", methods=["POST"])
@staff_required
def staff_delete(entry_id):
    e = own_entry(entry_id)
    if e["review_status"]:
        flash("Entries the PI has already looked at can't be deleted. Edit the entry instead.", "warn")
    else:
        db = get_db()
        db.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"]))
        audit("entry_deleted", f"{entry_id} {e['date']}")
        db.commit()
        flash("Entry deleted.", "ok")
    return redirect(url_for("staff_history"))


@app.route("/my-progress")
@staff_required
def staff_history():
    frm, to, preset = range_from_request()
    all_entries = entries_for(g.user["id"])
    sm = summarize(all_entries, frm, to)
    return render_template("staff_history.html", frm=frm, to=to, preset=preset, sm=sm,
                           has_any=bool(all_entries))


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    user = g.user
    if request.method == "POST":
        db = get_db()
        if request.form.get("remove_photo") == "1":
            remove_photo_file(user["photo"])
            db.execute("UPDATE users SET photo = '' WHERE id = ?", (user["id"],))
            audit("photo_removed")
            db.commit()
            flash("Photo removed.", "ok")
            return redirect(url_for("profile"))
        name = request.form.get("name", "").strip()[:120]
        designation = request.form.get("designation", "").strip()[:120]
        if len(name) < 3:
            flash("Enter your full name.", "warn")
            return redirect(url_for("profile"))
        fields = {
            "name": name, "designation": designation,
            "emp_code": request.form.get("emp_code", "").strip()[:60],
            "joined_on": (parse_date(request.form.get("joined_on")) or "") and request.form.get("joined_on"),
            "email": request.form.get("email", "").strip()[:120],
            "phone": request.form.get("phone", "").strip()[:30],
        }
        f = request.files.get("photo")
        if f and f.filename:
            try:
                new_name = save_photo(user["id"], f)
            except ValueError as exc:
                flash(str(exc), "warn")
                return redirect(url_for("profile"))
            remove_photo_file(user["photo"])
            fields["photo"] = new_name
        sets = ", ".join(f"{k} = ?" for k in fields)
        db.execute(f"UPDATE users SET {sets} WHERE id = ?", (*fields.values(), user["id"]))
        audit("profile_updated")
        db.commit()
        flash("Profile saved.", "ok")
        return redirect(url_for("profile"))
    return render_template("profile.html", user=user)


# --------------------------------------------------------------------------
# Admin pages
# --------------------------------------------------------------------------
@app.route("/admin")
@admin_required
def admin_overview():
    staff = staff_users()
    t = today()
    w_from, w_to = preset_range("week")
    m_from, m_to = preset_range("month")
    last14 = [t - dt.timedelta(days=i) for i in range(13, -1, -1)]
    cards, reported_today, week_entries, month_hours, pending = [], 0, 0, 0.0, 0
    for u in staff:
        es = entries_for(u["id"])
        dates = {e["date"] for e in es}
        sm = summarize(es, m_from, m_to)
        done = t.isoformat() in dates
        reported_today += done
        week_entries += sum(1 for e in es if w_from.isoformat() <= e["date"] <= w_to.isoformat())
        month_hours += sm["hours"]
        pending += sum(1 for e in es if needs_review(e))
        cards.append({"u": u, "last": es[0] if es else None, "sm": sm, "done": done,
                      "streak": streak(es),
                      "strip": [(d, d.isoformat() in dates) for d in last14]})
    names = {u["name"].strip().lower() for u in staff_users(include_inactive=True)}
    waiting = [r for r in config.ROSTER if r["name"].lower() not in names]
    return render_template("admin_overview.html", cards=cards, waiting=waiting,
                           stats={"staff": len(staff), "today": reported_today, "week": week_entries,
                                  "hours": month_hours, "pending": pending})


def admin_filters():
    frm, to, preset = range_from_request()
    try:
        uid = int(request.args.get("uid", "0"))
    except ValueError:
        uid = 0
    return {"frm": frm, "to": to, "preset": preset, "uid": uid,
            "cat": request.args.get("cat", "all"), "status": request.args.get("status", "all"),
            "review": request.args.get("review", "all")}


@app.route("/admin/log")
@admin_required
def admin_log():
    f = admin_filters()
    staff = staff_users(include_inactive=True)
    by_id = {u["id"]: u for u in staff}
    sql = "SELECT * FROM entries WHERE date >= ? AND date <= ?"
    args = [f["frm"].isoformat(), f["to"].isoformat()]
    if f["uid"]:
        sql += " AND user_id = ?"
        args.append(f["uid"])
    if f["cat"] in config.CATEGORIES:
        sql += " AND category = ?"
        args.append(f["cat"])
    if f["status"] in config.STATUSES:
        sql += " AND status = ?"
        args.append(f["status"])
    if f["review"] in ("reviewed", "revision"):
        sql += " AND review_status = ?"
        args.append(f["review"])
    sql += " ORDER BY date DESC, created_at DESC"
    rows = [r for r in get_db().execute(sql, args).fetchall() if r["user_id"] in by_id]
    if f["review"] == "pending":
        rows = [r for r in rows if needs_review(r)]
    hours = sum(float(r["hours"]) for r in rows)
    by_cat = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + float(r["hours"])
    keep = request.args.to_dict()
    keep.pop("review_open", None)
    return render_template("admin_log.html", f=f, staff=staff, by_id=by_id, rows=rows,
                           next_url=url_for("admin_log", **keep),
                           groups=group_by_day(rows), hours=hours,
                           by_cat=sorted(by_cat.items(), key=lambda kv: -kv[1]),
                           chart=daily_chart(rows, f["frm"], f["to"]) if rows else None,
                           open_review=request.args.get("review_open", type=int))


def group_by_day(rows):
    groups = {}
    for r in rows:
        groups.setdefault(r["date"], []).append(r)
    return [(d, groups[d], sum(float(x["hours"]) for x in groups[d]))
            for d in sorted(groups, reverse=True)]


@app.route("/admin/entries/<int:entry_id>/review", methods=["POST"])
@admin_required
def admin_review(entry_id):
    db = get_db()
    e = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if not e:
        abort(404)
    status = request.form.get("decision", "")
    remark = request.form.get("remark", e["review_remark"]).strip()[:2000]
    back = safe_next(request.form.get("next"), url_for("admin_log"))
    if status not in ("reviewed", "revision"):
        abort(400)
    if status == "revision" and not remark:
        flash("Add a remark explaining what should be revised.", "warn")
        return redirect(back)
    db.execute("UPDATE entries SET review_status = ?, review_remark = ?, reviewed_at = ?, reviewed_by = ? "
               "WHERE id = ?", (status, remark, now_str(), g.user["id"], entry_id))
    audit("entry_reviewed", f"{entry_id} {status}")
    db.commit()
    flash("Marked as reviewed." if status == "reviewed" else "Revision requested.", "ok")
    return redirect(back)


@app.route("/admin/reports")
@admin_required
def admin_reports():
    frm, to, preset = range_from_request()
    staff = staff_users(include_inactive=True)
    uid = request.args.get("uid", type=int) or (staff[0]["id"] if staff else 0)
    user = next((u for u in staff if u["id"] == uid), None)
    sm = summarize(entries_for(uid), frm, to) if user else None
    return render_template("admin_reports.html", staff=staff, user=user, frm=frm, to=to,
                           preset=preset, sm=sm,
                           groups=group_by_day(sm["entries"]) if sm else [])


@app.route("/admin/staff", methods=["GET", "POST"])
@admin_required
def admin_staff():
    db = get_db()
    new_credentials = None
    if request.method == "POST":
        username = request.form.get("username", "").strip().lower()
        name = request.form.get("name", "").strip()
        designation = request.form.get("designation", "").strip()
        role = "admin" if request.form.get("role") == "admin" else "staff"
        if not username.replace(".", "").replace("_", "").isalnum() or len(username) < 3:
            flash("Usernames need at least 3 characters: letters, numbers, dots or underscores.", "warn")
        elif len(name) < 3:
            flash("Enter the person's full name.", "warn")
        elif db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            flash(f"The username “{username}” is already taken.", "warn")
        else:
            temp = temp_password()
            db.execute("INSERT INTO users (username, password_hash, role, name, designation, created_at) "
                       "VALUES (?,?,?,?,?,?)",
                       (username, generate_password_hash(temp), role, name, designation, now_str()))
            audit("user_created", f"{username} {role}")
            db.commit()
            new_credentials = {"username": username, "password": temp, "name": name}
    users = db.execute("SELECT * FROM users ORDER BY role, active DESC, name").fetchall()
    return render_template("admin_staff.html", users=users, new_credentials=new_credentials)


def temp_password():
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(10))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return pw


@app.route("/admin/staff/<int:user_id>", methods=["GET", "POST"])
@admin_required
def admin_staff_edit(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        abort(404)
    new_credentials = None
    if request.method == "POST":
        action = request.form.get("action")
        if action == "reset_password":
            temp = temp_password()
            db.execute("UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?",
                       (generate_password_hash(temp), user_id))
            audit("password_reset", user["username"])
            db.commit()
            new_credentials = {"username": user["username"], "password": temp, "name": user["name"]}
        elif action == "toggle_active":
            if user_id == g.user["id"]:
                flash("You can't deactivate your own account.", "warn")
            else:
                db.execute("UPDATE users SET active = ? WHERE id = ?", (0 if user["active"] else 1, user_id))
                audit("user_deactivated" if user["active"] else "user_reactivated", user["username"])
                db.commit()
                flash("Account deactivated. Their records are kept." if user["active"]
                      else "Account reactivated.", "ok")
            return redirect(url_for("admin_staff_edit", user_id=user_id))
        else:
            name = request.form.get("name", "").strip()[:120]
            if len(name) < 3:
                flash("Enter the person's full name.", "warn")
            else:
                db.execute("UPDATE users SET name=?, designation=?, emp_code=?, joined_on=?, email=?, phone=? "
                           "WHERE id=?",
                           (name, request.form.get("designation", "").strip()[:120],
                            request.form.get("emp_code", "").strip()[:60],
                            request.form.get("joined_on", "") if parse_date(request.form.get("joined_on")) else "",
                            request.form.get("email", "").strip()[:120],
                            request.form.get("phone", "").strip()[:30], user_id))
                audit("user_updated", user["username"])
                db.commit()
                flash("Details saved.", "ok")
                return redirect(url_for("admin_staff_edit", user_id=user_id))
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return render_template("admin_staff_edit.html", user=user, new_credentials=new_credentials)


# --------------------------------------------------------------------------
# Reports (admin: anyone; staff: only themselves)
# --------------------------------------------------------------------------
def report_target(user_id):
    if g.user["role"] != "admin" and g.user["id"] != user_id:
        abort(404)
    user = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        abort(404)
    frm, to, _ = range_from_request()
    return user, frm, to, summarize(entries_for(user_id), frm, to)


def report_filename(user, frm, to, ext):
    base = "".join(c if c.isalnum() else "_" for c in user["name"].split(" ", 1)[-1])
    return f"Progress_Report_{base}_{frm}_to_{to}.{ext}".replace("__", "_")


@app.route("/reports/<int:user_id>/print")
@login_required
def report_print(user_id):
    user, frm, to, sm = report_target(user_id)
    return render_template("report_print.html", user=user, frm=frm, to=to, sm=sm,
                           rows=sorted(sm["entries"], key=lambda e: (e["date"], e["created_at"])),
                           generated=now_str())


@app.route("/reports/<int:user_id>.pdf")
@login_required
def report_pdf(user_id):
    from reports import build_pdf
    user, frm, to, sm = report_target(user_id)
    photo_path = os.path.join(UPLOAD_DIR, user["photo"]) if user["photo"] else None
    data = build_pdf(user, frm, to, sm, photo_path)
    audit("report_pdf", f"{user['username']} {frm} {to}")
    get_db().commit()
    return Response(data, mimetype="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{report_filename(user, frm, to, "pdf")}"'})


@app.route("/reports/<int:user_id>.csv")
@login_required
def report_csv(user_id):
    from reports import build_csv
    user, frm, to, sm = report_target(user_id)
    return Response(build_csv(user, sm), mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{report_filename(user, frm, to, "csv")}"'})


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------
@app.errorhandler(400)
@app.errorhandler(403)
@app.errorhandler(404)
@app.errorhandler(413)
def _error(err):
    messages = {
        400: ("Request couldn't be processed", getattr(err, "description", "")),
        403: ("Not available to your account", "This page is for administrators only."),
        404: ("Page not found", "The page or record you asked for doesn't exist, or isn't yours to view."),
        413: ("File too large", "Upload a photo smaller than 10 MB."),
    }
    title, text = messages.get(err.code, ("Something went wrong", ""))
    return render_template("error.html", title=title, text=text), err.code


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print("No database yet. Run:  python manage.py init")
        raise SystemExit(1)
    port = int(os.environ.get("PORT", "8000").strip())
    host = os.environ.get("HOST", "127.0.0.1").strip()
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    print(f"SLCR Progress Tracker running at http://{shown}:{port}  (press Ctrl+C to stop)")
    if host in ("0.0.0.0", "::"):
        print("Listening on all network interfaces: other computers can connect using this computer's IP address.")
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        app.run(host=host, port=port)
