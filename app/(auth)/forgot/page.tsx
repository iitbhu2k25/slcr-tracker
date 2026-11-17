import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotForm } from "@/components/forms";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Forgot password" };

export default async function ForgotPage() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <ForgotForm />
      <p className="muted small"><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
