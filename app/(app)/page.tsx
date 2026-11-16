import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminExists } from "@/lib/data";

export default async function Home() {
  const user = await currentUser();
  if (user) {
    redirect(user.role === "admin" ? "/admin" : "/entry");
  }
  const setupDone = process.env.SETUP_DONE === "1";
  if (!setupDone && !(await adminExists())) redirect("/setup");
  redirect("/login");
}
