import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms";
import { Flash } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { adminExists } from "@/lib/data";
import { param, type SearchParams } from "@/lib/dates";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.SETUP_DONE !== "1" && !(await adminExists())) redirect("/setup");
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <>
      <Flash m={param(sp, "m")} />
      <LoginForm />
      <p className="muted small"><Link href="/forgot">Forgot your password?</Link></p>
    </>
  );
}
