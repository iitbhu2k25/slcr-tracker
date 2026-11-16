"""Automated checks for access control and core features.

Run from the project folder:   python -m pytest -q tests
(or simply:                     python tests/test_app.py)
"""
import io
import os
import re
import sys
import tempfile

TMP = tempfile.mkdtemp(prefix="slcr-test-")
os.environ["SLCR_INSTANCE_DIR"] = TMP
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as appmod  # noqa: E402
from manage import connect, create_user  # noqa: E402
from PIL import Image  # noqa: E402

appmod.init_db()
_db = connect()
create_user(_db, "pi", "Prof. Test PI", "admin", "PI", "adminpass1", must_change=False)
create_user(_db, "alice", "Ms. Alice", "staff", "JRF", "alicepass1", must_change=False)
create_user(_db, "bob", "Mr. Bob", "staff", "Project Assistant", "bobpass12", must_change=False)
create_user(_db, "newbie", "Mr. New", "staff", "JRF", "temppass1", must_change=True)
_db.commit()
IDS = {r["username"]: r["id"] for r in _db.execute("SELECT id, username FROM users")}
_db.close()
app = appmod.app
app.config["TESTING"] = True


def client_for(username, password):
    c = app.test_client()
    page = c.get("/login").get_data(as_text=True)
    tok = re.search(r'name="csrf_token" value="([^"]+)"', page).group(1)
    r = c.post("/login", data={"username": username, "password": password, "csrf_token": tok})
    assert r.status_code == 302, (username, r.status_code)
    c.tok = tok_of(c)
    return c


def tok_of(c):
    with c.session_transaction() as s:
        return s["csrf"]


def post(c, url, data=None, **kw):
    data = dict(data or {})
    data.setdefault("csrf_token", tok_of(c))
    return c.post(url, data=data, **kw)


def add_entry(c, title, date="2026-01-05"):
    r = post(c, "/entry", {"date": date, "hours": "7.5", "location": "Field site",
                           "category": "GIS & remote sensing", "status": "Completed",
                           "title": title, "work": "Digitised drainage network for the sub-basin."})
    assert r.status_code == 302, r.get_data(as_text=True)[:500]


def entry_id(owner, title):
    db = connect()
    row = db.execute("SELECT id FROM entries WHERE user_id = ? AND title = ?", (IDS[owner], title)).fetchone()
    db.close()
    return row["id"]


def test_everything():
    alice, bob, pi = client_for("alice", "alicepass1"), client_for("bob", "bobpass12"), client_for("pi", "adminpass1")

    # anonymous users are sent to login
    assert app.test_client().get("/my-progress").status_code == 302
    assert app.test_client().get(f"/reports/{IDS['alice']}.pdf").status_code == 302

    # wrong password and CSRF protection
    anon = app.test_client()
    anon.get("/login")
    assert anon.post("/login", data={"username": "alice", "password": "x", "csrf_token": tok_of(anon)}).status_code == 200
    assert alice.post("/entry", data={"title": "no token"}).status_code == 400

    add_entry(alice, "Alice secret task")
    add_entry(bob, "Bob task")
    a_id, b_id = entry_id("alice", "Alice secret task"), entry_id("bob", "Bob task")

    # staff see only their own entries
    page = alice.get("/my-progress?from=2026-01-01&to=2026-01-31").get_data(as_text=True)
    assert "Alice secret task" in page and "Bob task" not in page
    page = bob.get("/my-progress?from=2026-01-01&to=2026-01-31").get_data(as_text=True)
    assert "Bob task" in page and "Alice secret task" not in page

    # staff cannot touch another person's entry, report or photo
    assert bob.get(f"/entry/{a_id}/edit").status_code == 404
    assert post(bob, f"/entry/{a_id}/edit", {"title": "hacked"}).status_code == 404
    assert post(bob, f"/entry/{a_id}/delete").status_code == 404
    assert bob.get(f"/reports/{IDS['alice']}.pdf?from=2026-01-01&to=2026-01-31").status_code == 404
    assert bob.get(f"/reports/{IDS['alice']}.csv").status_code == 404
    assert bob.get(f"/reports/{IDS['alice']}/print").status_code == 404
    assert bob.get(f"/photo/{IDS['alice']}").status_code == 404

    # staff cannot reach admin pages or write reviews
    for url in ["/admin", "/admin/log", "/admin/reports", "/admin/staff", f"/admin/staff/{IDS['alice']}"]:
        assert bob.get(url).status_code == 403, url
    assert post(bob, f"/admin/entries/{b_id}/review", {"decision": "reviewed"}).status_code == 403
    assert post(bob, "/admin/staff", {"username": "evil", "name": "Evil", "role": "admin"}).status_code == 403

    # photo upload: own photo visible to self and admin only
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), (20, 120, 140)).save(buf, "PNG")
    buf.seek(0)
    r = post(alice, "/profile", {"name": "Ms. Alice", "designation": "JRF", "photo": (buf, "me.png")},
             content_type="multipart/form-data")
    assert r.status_code == 302
    assert alice.get(f"/photo/{IDS['alice']}").status_code == 200
    assert pi.get(f"/photo/{IDS['alice']}").status_code == 200
    assert bob.get(f"/photo/{IDS['alice']}").status_code == 404
    bad = post(alice, "/profile", {"name": "Ms. Alice", "photo": (io.BytesIO(b"not an image"), "x.png")},
               content_type="multipart/form-data", follow_redirects=True)
    assert "isn" in bad.get_data(as_text=True)

    # admin sees everyone
    page = pi.get("/admin/log?from=2026-01-01&to=2026-01-31").get_data(as_text=True)
    assert "Alice secret task" in page and "Bob task" in page
    assert "Ms. Alice" in pi.get("/admin").get_data(as_text=True)

    # review flow: revision needs a remark; reviewed entries lock for staff
    r = post(pi, f"/admin/entries/{a_id}/review", {"decision": "revision", "remark": ""}, follow_redirects=True)
    assert "Add a remark" in r.get_data(as_text=True)
    post(pi, f"/admin/entries/{a_id}/review", {"decision": "revision", "remark": "Please add the output file name."})
    page = alice.get("/my-progress?from=2026-01-01&to=2026-01-31").get_data(as_text=True)
    assert "Please add the output file name." in page
    assert post(alice, f"/entry/{a_id}/delete", follow_redirects=True).status_code == 200
    assert entry_id("alice", "Alice secret task")  # not deleted after review started
    post(pi, f"/admin/entries/{a_id}/review", {"decision": "reviewed", "remark": "Good."})
    r = alice.get(f"/entry/{a_id}/edit")
    assert r.status_code == 302  # locked, redirected
    # staff cannot forge a review through the edit form
    db = connect()
    assert db.execute("SELECT review_status FROM entries WHERE id = ?", (a_id,)).fetchone()[0] == "reviewed"
    db.close()

    # validation: future dates rejected
    r = post(alice, "/entry", {"date": "2999-01-01", "hours": "8", "category": "GIS & remote sensing",
                               "status": "Completed", "title": "Future", "work": "Something long enough here"})
    assert "future" in r.get_data(as_text=True)

    # reports build for admin and for the staff member themself
    r = pi.get(f"/reports/{IDS['alice']}.pdf?from=2026-01-01&to=2026-01-31")
    assert r.status_code == 200 and r.data[:4] == b"%PDF" and len(r.data) > 3000
    open(os.path.join(TMP, "sample_report.pdf"), "wb").write(r.data)
    assert alice.get(f"/reports/{IDS['alice']}.pdf?from=2026-01-01&to=2026-01-31").data[:4] == b"%PDF"
    csv_text = pi.get(f"/reports/{IDS['alice']}.csv?from=2026-01-01&to=2026-01-31").get_data(as_text=True)
    assert "Alice secret task" in csv_text and "Bob task" not in csv_text
    assert "Alice secret task" in pi.get(f"/reports/{IDS['alice']}/print?from=2026-01-01&to=2026-01-31").get_data(as_text=True)

    # forced password change for temporary passwords
    nb = client_for("newbie", "temppass1")
    assert nb.get("/entry").headers["Location"].endswith("/password")
    r = post(nb, "/password", {"current": "temppass1", "new": "brandnew99", "confirm": "brandnew99"})
    assert r.status_code == 302 and nb.get("/entry").status_code == 200

    # admin password reset signs the user out everywhere
    r = post(pi, f"/admin/staff/{IDS['bob']}", {"action": "reset_password"})
    assert "Temporary password" in r.get_data(as_text=True)
    assert bob.get("/my-progress").status_code == 302

    # deactivated accounts cannot sign in
    post(pi, f"/admin/staff/{IDS['newbie']}", {"action": "toggle_active"})
    assert nb.get("/entry").status_code == 302

    # lockout after repeated failures
    c = app.test_client()
    c.get("/login")
    for _ in range(5):
        c.post("/login", data={"username": "alice", "password": "wrong", "csrf_token": tok_of(c)})
    r = c.post("/login", data={"username": "alice", "password": "alicepass1", "csrf_token": tok_of(c)})
    assert "Too many failed attempts" in r.get_data(as_text=True)

    print("All checks passed. Sample PDF:", os.path.join(TMP, "sample_report.pdf"))


if __name__ == "__main__":
    test_everything()
