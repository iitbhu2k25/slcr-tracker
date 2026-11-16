import { PasswordForm } from "@/components/forms";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Change password" };

export default async function PasswordPage() {
  const user = await requireUser({ allowMustChange: true });
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Account security</p>
          <h1>{user.must_change_pw ? "Set a new password" : "Change your password"}</h1>
        </div>
      </section>
      <PasswordForm forced={user.must_change_pw} />
    </>
  );
}
