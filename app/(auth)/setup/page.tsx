import { redirect } from "next/navigation";
import { SetupForm } from "@/components/forms";
import { adminExists } from "@/lib/data";

export const metadata = { title: "First-time setup" };

export default async function SetupPage() {
  if (await adminExists()) redirect("/login");
  return <SetupForm />;
}
