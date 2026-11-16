import { notFound, redirect } from "next/navigation";
import { EntryForm } from "@/components/forms";
import { StaffSidebar } from "@/components/staff-sidebar";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtLong, todayISO } from "@/lib/dates";
import { withMsg } from "@/lib/messages";
import type { Entry } from "@/lib/types";

export const metadata = { title: "Edit entry" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const sql = await db();
  const [e] = await sql<Entry[]>`SELECT * FROM entries WHERE id = ${id} AND user_id = ${user.id}`;
  if (!e) notFound();
  if (e.review_status === "reviewed") redirect(withMsg("/my-progress", "locked"));
  const today = todayISO();
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Editing an entry</p>
          <h1>Update your entry</h1>
        </div>
        <p className="muted small">{fmtLong(today)}</p>
      </section>
      <div className="split">
        <EntryForm
          entryId={e.id}
          today={today}
          revisionRemark={e.review_status === "revision" ? e.review_remark : undefined}
          initial={{ date: e.date, hours: String(e.hours), location: e.location, category: e.category, status: e.status,
            title: e.title, work: e.work, outputs: e.outputs, next_plan: e.next_plan, issues: e.issues }}
        />
        <StaffSidebar userId={user.id} />
      </div>
    </>
  );
}
