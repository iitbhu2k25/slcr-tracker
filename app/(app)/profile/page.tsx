import Link from "next/link";
import { removePhotoAction } from "@/app/actions";
import { ProfileForm, SubmitButton } from "@/components/forms";
import { Avatar, Flash } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtStamp, param, todayISO, type SearchParams } from "@/lib/dates";

export const metadata = { title: "My profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <Flash m={param(sp, "m")} />
      <section className="page-head">
        <div>
          <p className="eyebrow">{user.role === "admin" ? "My account" : "My profile"}</p>
          <h1>Profile details</h1>
        </div>
        <Link className="btn" href="/password">Change password</Link>
      </section>
      <ProfileForm
        today={todayISO()}
        avatar={<Avatar user={user} size="xl" />}
        user={{ name: user.name, designation: user.designation, emp_code: user.emp_code, joined_on: user.joined_on,
          email: user.email, phone: user.phone }}
      />
      {user.has_photo && (
        <form action={removePhotoAction} className="actions">
          <SubmitButton className="btn sm danger">Remove my photo</SubmitButton>
        </form>
      )}
      <p className="muted small">
        Signed in as <span className="mono">{user.username}</span>
        {user.last_login && <> · last sign-in {fmtStamp(user.last_login)}</>}
      </p>
    </>
  );
}
