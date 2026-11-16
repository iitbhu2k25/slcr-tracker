import { EntryForm } from "@/components/forms";
import { StaffSidebar } from "@/components/staff-sidebar";
import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { CATEGORIES, LOCATIONS } from "@/lib/config";
import { fmtLong, param, todayISO, type SearchParams } from "@/lib/dates";

export const metadata = { title: "Daily entry" };

export default async function EntryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  return (
    <>
      <Flash m={param(sp, "m")} d={param(sp, "d")} />
      <section className="page-head">
        <div>
          <p className="eyebrow">Daily entry</p>
          <h1>What did you work on today?</h1>
        </div>
        <p className="muted small">{fmtLong(today)}</p>
      </section>
      <div className="split">
        <EntryForm
          key={param(sp, "d") || "new"}
          today={today}
          initial={{ date: today, hours: "8", location: LOCATIONS[0], category: CATEGORIES[0], status: "Completed",
            title: "", work: "", outputs: "", next_plan: "", issues: "" }}
        />
        <StaffSidebar userId={user.id} />
      </div>
    </>
  );
}
