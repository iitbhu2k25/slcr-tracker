import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminExists } from "@/lib/data";

export default async function Home() {
  if (!(await adminExists())) redirect("/setup");
  const user = await requireUser();
  redirect(user.role === "admin" ? "/admin" : "/entry");
}
