"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  changePasswordAction, createRosterAction, createUserAction, loginAction, resetPasswordAction, saveEntryAction,
  saveProfileAction, setupAction, type CredState, type FormState,
} from "@/app/actions";
import { CATEGORIES, DESIGNATIONS, LOCATIONS, MIN_PASSWORD_LENGTH, STATUSES } from "@/lib/config";

/* ------------------------------------------------------------------ small pieces */

export function SubmitButton({ children, className = "btn primary", name, value }: {
  children: React.ReactNode; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} name={name} value={value} disabled={pending} aria-disabled={pending}>
      {children}
    </button>
  );
}

function ErrorBox({ state }: { state: FormState | CredState }) {
  const list = "errors" in state && state.errors?.length ? state.errors : state.error ? [state.error] : [];
  if (!list.length) return null;
  return (
    <ul className="errors" role="alert">
      {list.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

export function CredentialsBox({ state, title }: { state: CredState; title: string }) {
  if (!state.credentials?.length) return null;
  return (
    <div className="creds" role="status">
      <strong>{title}</strong>
      <span>
        {state.credentials.every((c) => c.mail === "sent")
          ? "The sign-in details have been emailed. They are also shown here once, in case the email doesn't arrive."
          : "Give each person their details privately (in person or a direct message). These passwords are shown only once; each person must change theirs at first sign-in."}
      </span>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Name</th><th>Username</th><th>Temporary password</th><th>Email</th></tr></thead>
          <tbody>
            {state.credentials.map((c) => (
              <tr key={c.username}>
                <td>{c.name}</td>
                <td><code>{c.username}</code></td>
                <td><code>{c.password}</code></td>
                <td className="small">
                  {c.mail === "sent" ? <span className="pill ok">Sent to {c.email}</span>
                    : c.mail === "failed" ? <span className="pill bad" title={c.mailError}>Not sent: give it by hand</span>
                    : <span className="muted">No email on file</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>;
}

export function NavTabs({ role }: { role: "admin" | "staff" }) {
  const path = usePathname();
  const tabs: [string, string, (p: string) => boolean][] =
    role === "admin"
      ? [
          ["/admin", "Team overview", (p) => p === "/admin"],
          ["/admin/log", "Progress log", (p) => p.startsWith("/admin/log")],
          ["/admin/reports", "Reports", (p) => p.startsWith("/admin/reports")],
          ["/admin/staff", "Staff accounts", (p) => p.startsWith("/admin/staff")],
          ["/profile", "My account", (p) => p === "/profile" || p === "/password"],
        ]
      : [
          ["/entry", "Daily entry", (p) => p === "/entry" || /^\/entry\/\d+/.test(p)],
          ["/my-progress", "My progress", (p) => p === "/my-progress"],
          ["/profile", "My profile", (p) => p === "/profile" || p === "/password"],
        ];
  return (
    <nav className="tabs" aria-label="Sections">
      <div className="wrap">
        {tabs.map(([href, label, active]) => (
          <Link key={href} className="tab" href={href} aria-current={active(path) ? "page" : undefined}>{label}</Link>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ setup & sign-in */

export function SetupForm() {
  const [state, action] = useActionState(setupAction, {} as FormState);
  return (
    <form className="stack" action={action}>
      <div>
        <p className="eyebrow">First-time setup</p>
        <h2>Create the administrator account</h2>
      </div>
      <p className="muted small">This page works only once, before any administrator exists. Use the setup key you added to the Vercel project.</p>
      <ErrorBox state={state} />
      <label htmlFor="setup_key">Setup key<input id="setup_key" name="setup_key" type="password" required autoComplete="off" /></label>
      <label htmlFor="name">Your full name<input id="name" name="name" required defaultValue={state.values?.name ?? ""} placeholder="e.g. Prof. A. B. Singh" /></label>
      <label htmlFor="username">Username<span className="hint">Letters, numbers, dots or underscores</span>
        <input id="username" name="username" required autoCapitalize="none" defaultValue={state.values?.username ?? "pi"} /></label>
      <label htmlFor="password">Password<span className="hint">At least {MIN_PASSWORD_LENGTH} characters, letters and numbers</span>
        <input id="password" name="password" type="password" required autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} /></label>
      <label htmlFor="confirm">Repeat password<input id="confirm" name="confirm" type="password" required autoComplete="new-password" /></label>
      <SubmitButton>Create administrator</SubmitButton>
    </form>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {} as FormState);
  return (
    <form action={action} className="stack">
      <ErrorBox state={state} />
      <label htmlFor="username">Username
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required autoFocus defaultValue={state.values?.username ?? ""} /></label>
      <label htmlFor="password">Password
        <input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action] = useActionState(changePasswordAction, {} as FormState);
  return (
    <form className="panel stack" action={action} style={{ maxWidth: 520 }}>
      {forced && (
        <div className="notice">
          <strong>Choose your own password to continue</strong>
          <span>You signed in with a temporary password from the administrator. Replace it with one only you know.</span>
        </div>
      )}
      <ErrorBox state={state} />
      <label htmlFor="current">{forced ? "Temporary password" : "Current password"}
        <input id="current" name="current" type="password" autoComplete="current-password" required /></label>
      <label htmlFor="new">New password<span className="hint">At least {MIN_PASSWORD_LENGTH} characters, with letters and numbers</span>
        <input id="new" name="new" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} /></label>
      <label htmlFor="confirm">Repeat new password
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></label>
      <div className="actions">
        <SubmitButton>Save password</SubmitButton>
        {!forced && <Link className="btn" href="/profile">Cancel</Link>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ daily entry */

export function EntryForm({ initial, entryId, today, revisionRemark }: {
  initial: Record<string, string>; entryId?: number; today: string; revisionRemark?: string;
}) {
  const [state, action] = useActionState(saveEntryAction, {} as FormState);
  const v = state.values ?? initial;
  const editing = !!entryId;
  return (
    <form className="panel stack" action={action}>
      {entryId && <input type="hidden" name="entry_id" value={entryId} />}
      {revisionRemark && (
        <div className="notice warn"><strong>The PI asked for a revision</strong><span>{revisionRemark}</span></div>
      )}
      <ErrorBox state={state} />
      <div className="grid3">
        <label htmlFor="date">Date <span className="req">*</span>
          <input type="date" id="date" name="date" defaultValue={v.date} max={today} required /></label>
        <label htmlFor="hours">Hours worked <span className="req">*</span>
          <input type="number" id="hours" name="hours" min="0" max="24" step="0.5" defaultValue={v.hours} required /></label>
        <label htmlFor="location">Work location
          <select id="location" name="location" defaultValue={v.location}>{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
      </div>
      <div className="grid2">
        <label htmlFor="category">Work category <span className="req">*</span>
          <select id="category" name="category" defaultValue={v.category}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label htmlFor="status">Task status
          <select id="status" name="status" defaultValue={v.status}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <label htmlFor="title">Task title <span className="req">*</span>
        <input id="title" name="title" maxLength={140} defaultValue={v.title} required placeholder="e.g. Rainfall–runoff calibration for the Varuna sub-basin" /></label>
      <label htmlFor="work">Work carried out <span className="req">*</span><span className="hint">What you did, methods used and progress made</span>
        <textarea id="work" name="work" rows={5} maxLength={4000} defaultValue={v.work} /></label>
      <label htmlFor="outputs">Outputs / deliverables <span className="hint">Files, maps, datasets, code commits, drafts</span>
        <textarea id="outputs" name="outputs" rows={2} maxLength={2000} defaultValue={v.outputs} /></label>
      <div className="grid2">
        <label htmlFor="next_plan">Plan for next working day
          <textarea id="next_plan" name="next_plan" rows={3} maxLength={2000} defaultValue={v.next_plan} /></label>
        <label htmlFor="issues">Issues or support needed
          <textarea id="issues" name="issues" rows={3} maxLength={2000} defaultValue={v.issues} /></label>
      </div>
      <div className="actions">
        <SubmitButton>{editing ? "Save changes" : "Submit entry"}</SubmitButton>
        {editing && <Link className="btn" href="/my-progress">Cancel</Link>}
      </div>
      <p className="muted small">You can add more than one entry for the same day if you worked on separate tasks.</p>
    </form>
  );
}

/* ------------------------------------------------------------------ profile */

function resizeToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (JPG or PNG)."));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That image is larger than 15 MB. Choose a smaller one."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be opened.")); };
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = 360; c.height = 360;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 360, 360);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 360, 360);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.86));
    };
    img.src = url;
  });
}

export function ProfileForm({ user, today, avatar }: {
  user: { name: string; designation: string; emp_code: string; joined_on: string; email: string; phone: string };
  today: string;
  avatar: React.ReactNode;
}) {
  const [state, action] = useActionState(saveProfileAction, {} as FormState);
  const [photo, setPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const designations = !user.designation || DESIGNATIONS.includes(user.designation) ? DESIGNATIONS : [user.designation, ...DESIGNATIONS];
  return (
    <form className="panel stack" action={action}>
      <ErrorBox state={state} />
      <div className="row" style={{ gap: 18 }}>
        {photo ? <img className="avatar xl" src={photo} alt="" /> : avatar}
        <div className="photo-input">
          <strong>Profile photo</strong>
          <span className="muted small">Optional. A clear, front-facing photo works best. It is cropped to a square and appears on your progress reports.</span>
          <label htmlFor="photo_file" className="small">Choose a photo (JPG or PNG)
            <input type="file" id="photo_file" accept="image/*" onChange={async (ev) => {
              const f = ev.target.files?.[0];
              setPhotoError("");
              if (!f) return;
              try { setPhoto(await resizeToJpeg(f)); } catch (e) { setPhotoError((e as Error).message); setPhoto(""); }
            }} />
          </label>
          {photo && <span className="preview-note">New photo ready. Click Save profile to keep it.</span>}
          {photoError && <span className="errors">{photoError}</span>}
          <input type="hidden" name="photo_data" value={photo} />
        </div>
      </div>
      <div className="grid2">
        <label htmlFor="name">Full name with title <span className="req">*</span><input id="name" name="name" defaultValue={user.name} required /></label>
        <label htmlFor="designation">Designation
          <select id="designation" name="designation" defaultValue={user.designation}>{designations.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label htmlFor="emp_code">Employee / project ID<input id="emp_code" name="emp_code" defaultValue={user.emp_code} /></label>
        <label htmlFor="joined_on">Date of joining the project<input type="date" id="joined_on" name="joined_on" defaultValue={user.joined_on} max={today} /></label>
        <label htmlFor="email">Email<input type="email" id="email" name="email" defaultValue={user.email} /></label>
        <label htmlFor="phone">Phone<input id="phone" name="phone" defaultValue={user.phone} /></label>
      </div>
      <div className="actions"><SubmitButton>Save profile</SubmitButton></div>
    </form>
  );
}

/* ------------------------------------------------------------------ admin: accounts */

export function AddUserForm() {
  const [state, action] = useActionState(createUserAction, {} as CredState);
  const [role, setRole] = useState<"staff" | "admin">("staff");
  // A new key after each success clears the form for the next person.
  const formKey = state.credentials?.[0]?.username ?? "new";
  return (
    <div className="stack">
      <CredentialsBox state={state} title={state.credentials?.[0] ? `Account created for ${state.credentials[0].name}` : "Account created"} />
      <form key={formKey} className="panel stack" action={action}>
        <h2>Add a staff member or administrator</h2>
        <ErrorBox state={state} />
        <div className="grid2">
          <label htmlFor="role">Account type <span className="req">*</span><select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
            <option value="staff">Staff: sees only their own records</option>
            <option value="admin">Administrator: sees everyone and manages accounts (e.g. Co-PI)</option>
          </select></label>
          <label htmlFor="name">Full name with title <span className="req">*</span><input id="name" name="name" required placeholder="e.g. Mr. Gaurav Kumar" /></label>
          <label htmlFor="email">Email <span className="req">*</span><span className="hint">The username and one-time password are sent here</span>
            <input id="email" name="email" type="email" required autoCapitalize="none" placeholder="e.g. gaurav@iitbhu.ac.in" /></label>
          <label htmlFor="username">Username <span className="req">*</span><span className="hint">Letters, numbers, dots or underscores</span>
            <input id="username" name="username" required autoCapitalize="none" placeholder="e.g. gaurav" /></label>
          {role === "staff"
            ? <label htmlFor="designation">Designation<select id="designation" name="designation">{DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select></label>
            : <label htmlFor="designation">Designation<input id="designation" name="designation" placeholder="e.g. Co-Principal Investigator" /></label>}
        </div>
        <div className="actions"><SubmitButton>{role === "admin" ? "Create administrator and send email" : "Create account and send email"}</SubmitButton></div>
        <p className="muted small">A one-time password is generated and emailed to the person. At first sign-in they must choose their own new password.</p>
      </form>
    </div>
  );
}

export function RosterButton({ missing }: { missing: string[] }) {
  const [state, action] = useActionState(createRosterAction, {} as CredState);
  if (state.credentials?.length) return <CredentialsBox state={state} title="Roster accounts created" />;
  if (!missing.length) return null;
  return (
    <form className="panel stack" action={action}>
      <h2>Project roster</h2>
      <p className="small">These roster members don't have an account yet: {missing.join(", ")}.</p>
      <ErrorBox state={state} />
      <div className="actions"><SubmitButton>Create accounts for the roster</SubmitButton></div>
    </form>
  );
}

export function ResetPasswordForm({ userId, email }: { userId: number; email: string }) {
  const [state, action] = useActionState(resetPasswordAction, {} as CredState);
  return (
    <>
      <CredentialsBox state={state} title="New temporary password" />
      <ErrorBox state={state} />
      <form action={action} className="inline">
        <input type="hidden" name="user_id" value={userId} />
        <SubmitButton className="btn">{email ? "Reset password and email it" : "Reset password"}</SubmitButton>
      </form>
      <p className="muted small">
        {email ? <>The new one-time password will be emailed to <strong>{email}</strong>.</>
          : "No email on file: add one under Details above to have the new password emailed."}
      </p>
    </>
  );
}
