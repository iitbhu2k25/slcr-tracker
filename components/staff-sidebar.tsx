import Link from "next/link";
import { entriesFor } from "@/lib/data";
import { fmtDate, presetRange, streak, summarize, todayISO } from "@/lib/dates";
import { ReviewPill, Stat } from "./ui";

export async function StaffSidebar({ userId }: { userId: number }) {
  const all = await entriesFor(userId);
  const [from, to] = presetRange("month");
  const month = summarize(all, from, to);
  const today = todayISO();
  const doneToday = all.some((e) => e.date === today);
  const revisions = all.filter(
    (e) => e.review_status === "revision" && e.reviewed_at && new Date(e.updated_at) <= new Date(e.reviewed_at),
  );
  return (
    <aside className="stack">
      <div className={`notice ${doneToday ? "" : "warn"}`}>
        <strong>{doneToday ? "Today's progress is recorded" : "No entry for today yet"}</strong>
        <span>{doneToday ? "You can add another entry if you worked on more tasks." : "Submit today’s entry before you leave."}</span>
      </div>
      {revisions.length > 0 && (
        <div className="notice warn">
          <strong>{revisions.length} {revisions.length === 1 ? "entry needs" : "entries need"} revision</strong>
          <span>The PI has left remarks. Open the entry from My progress and update it.</span>
          <span><Link className="btn sm" href="/my-progress?preset=90">Open My progress</Link></span>
        </div>
      )}
      <div className="stats two">
        <Stat value={month.daysReported} sub={month.workingDays} label="Days reported this month" />
        <Stat value={month.hours.toFixed(1).replace(/\.0$/, "")} label="Hours this month" />
        <Stat value={streak(all)} label="Working-day streak" />
        <Stat value={month.reviewed} label="Reviewed by PI this month" />
      </div>
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Recent entries</h3>
          <Link className="btn sm" href="/my-progress">View all</Link>
        </div>
        {all.length === 0 && <p className="muted small">Your submitted entries will appear here.</p>}
        {all.slice(0, 4).map((e) => (
          <div key={e.id} className="stack" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="mono small">{fmtDate(e.date)}</span>
              <ReviewPill status={e.review_status} />
            </div>
            <span className="entry-title small">{e.title}</span>
            {e.review_remark && (
              <span className="muted small">PI: {e.review_remark.length > 120 ? e.review_remark.slice(0, 120) + "…" : e.review_remark}</span>
            )}
          </div>
        ))}
      </section>
    </aside>
  );
}
