import Link from "next/link";
import { notFound } from "next/navigation";
import { toggleActiveAction, updateUserAction } from "@/app/actions";
import { ResetPasswordForm, SubmitButton } from "@/components/forms";
import { Avatar, Flash } from "@/components/ui";
import { findUserById, requireAdmin } from "@/lib/auth";
import { DESIGNATIONS } from "@/lib/config";
import { fmtStamp, param, type SearchParams } from "@/lib/dates";

export const metadata = { title: "Manage account" };

export default async function ManageAccount({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<SearchParams>;
}) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const user = Number.isInteger(id) ? await findUserById(id) : null;
  if (!user) notFound();
  const sp = await searchParams;
  const designations = !user.designation || DESIGNATIONS.includes(user.designation) ? DESIGNATIONS : [user.designation, ...DESIGNATIONS];
  return (
    <>
      <Flash m={param(sp, "m")} />
      <section className="page-head">
        <div className="row" style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Avatar user={user} size="lg" />
          <div>
            <p className="eyebrow">Manage account</p>
            <h1>{user.name}</h1>
          </div>
        </div>
        <Link className="btn" href="/admin/staff">Back to staff accounts</Link>
      </section>
      <form className="panel stack" action={updateUserAction}>
        <input type="hidden" name="user_id" value={user.id} />
        <h2>Details</h2>
        <div className="grid2">
          <label htmlFor="name">Full name with title <span className="req">*</span><input id="name" name="name" defaultValue={user.name} required minLength={3} /></label>
          <label htmlFor="designation">Designation
            <select id="designation" name="designation" defaultValue={user.designation}>{designations.map((d) => <option key={d}>{d}</option>)}</select>
          </label>
          <label htmlFor="emp_code">Employee / project ID<input id="emp_code" name="emp_code" defaultValue={user.emp_code} /></label>
          <label htmlFor="joined_on">Date of joining<input type="date" id="joined_on" name="joined_on" defaultValue={user.joined_on} /></label>
          <label htmlFor="email">Email<input type="email" id="email" name="email" defaultValue={user.email} /></label>
          <label htmlFor="phone">Phone<input id="phone" name="phone" defaultValue={user.phone} /></label>
        </div>
        <div className="actions"><SubmitButton>Save details</SubmitButton></div>
        <p className="muted small">Staff add their own photo from their profile page.</p>
      </form>
      <section className="panel stack">
        <h2>Access</h2>
        <p className="muted small">
          Username <span className="mono">{user.username}</span> · {user.role === "admin" ? "Administrator" : "Staff"} ·{" "}
          {user.active ? "Active" : "Deactivated"}
          {user.last_login && <> · last sign-in {fmtStamp(user.last_login)}</>}
        </p>
        <div className="stack">
          <ResetPasswordForm userId={user.id} email={user.email} />
          <div className="actions">
            {user.id !== me.id && (
              <form action={toggleActiveAction} className="inline">
                <input type="hidden" name="user_id" value={user.id} />
                <SubmitButton className={`btn ${user.active ? "danger" : ""}`}>
                  {user.active ? "Deactivate account" : "Reactivate account"}
                </SubmitButton>
              </form>
            )}
            {user.role === "staff" && <Link className="btn" href={`/admin/log?uid=${user.id}&preset=month`}>Open progress log</Link>}
          </div>
        </div>
        <p className="muted small">
          Resetting a password signs the person out everywhere. Deactivating stops them signing in; their past entries stay in reports.
        </p>
      </section>
    </>
  );
}
