import { apiUser, audit } from "@/lib/auth";
import { getBackupData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full export of accounts (without password hashes), entries, reviews and photos. Administrators only. */
export async function GET() {
  const me = await apiUser();
  if (!me || me.role !== "admin") return new Response("Not found", { status: 404 });
  await audit(me.id, "backup_downloaded");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      note: "SLCR Progress Tracker backup. Keep private: contains all staff records. Passwords are not included.",
      ...(await getBackupData()),
    },
    null,
    1,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="slcr-tracker-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
