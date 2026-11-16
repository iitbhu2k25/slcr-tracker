import Link from "next/link";
import { AddUserForm, RosterButton } from "@/components/forms";
import { Avatar } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROSTER } from "@/lib/config";
import { allUsers } from "@/lib/data";
import { fmtStamp } from "@/lib/dates";

export const metadata = { title: "Staff accounts" };

export default async function StaffAccounts() {
  await requireAdmin();
  const users = await allUsers();
  const names = new Set(users.map((u) => u.name.trim().toLowerCase()));
  const missing = ROSTER.filter((r) => !names.has(r.name.toLowerCase())).map((r) => r.name);
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Staff accounts</p>
          <h1>Who can sign in</h1>
        </div>
      </section>
      <RosterButton missing={missing} />
      <section className="panel">
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr><th>Person</th><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row">
                      <Avatar user={u} />
                      <div><strong>{u.name}</strong><br /><span className="muted small">{u.designation}</span></div>
                    </div>
                  </td>
                  <td className="mono">{u.username}</td>
                  <td>{u.role === "admin" ? "Administrator" : "Staff"}</td>
                  <td>
                    {!u.active ? <span className="pill bad">Deactivated</span>
                      : u.must_change_pw ? <span className="pill warn">Temporary password</span>
                      : <span className="pill ok">Active</span>}
                  </td>
                  <td className="small">{u.last_login ? fmtStamp(u.last_login) : "Never"}</td>
                  <td><Link className="btn sm" href={`/admin/staff/${u.id}`}>Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AddUserForm />
      <section className="panel stack">
        <h2>Backup</h2>
        <p className="small">
          Download a copy of every account, entry, review and photo as one file. Do this at least once a month and keep it
          somewhere private, such as your institute drive.
        </p>
        <div className="actions"><a className="btn" href="/admin/backup">Download backup (.json)</a></div>
      </section>
    </>
  );
}
