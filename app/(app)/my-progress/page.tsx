import Link from "next/link";
import { DayGroups } from "@/components/entries";
import { Empty, Flash, Presets, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { entriesFor } from "@/lib/data";
import { hrs, param, rangeFromParams, summarize, type SearchParams } from "@/lib/dates";

export const metadata = { title: "My progress" };

export default async function MyProgressPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const [from, to, preset] = rangeFromParams(sp);
  const all = await entriesFor(user.id);
  const sm = summarize(all, from, to);
  const qs = `from=${from}&to=${to}`;
  return (
    <>
      <Flash m={param(sp, "m")} />
      <section className="page-head">
        <div>
          <p className="eyebrow">My progress</p>
          <h1>Your entries and PI remarks</h1>
        </div>
      </section>
      <section className="panel stack">
        <Presets base="/my-progress" current={preset} />
        <form className="filters" method="get">
          <label htmlFor="from">From<input type="date" id="from" name="from" defaultValue={from} /></label>
          <label htmlFor="to">To<input type="date" id="to" name="to" defaultValue={to} /></label>
          <div className="actions"><button className="btn">Show</button></div>
          <div className="actions">
            <a className="btn primary" href={`/reports/${user.id}/pdf?${qs}`}>Download PDF</a>
            <a className="btn" href={`/reports/${user.id}/csv?${qs}`}>CSV</a>
            <Link className="btn" href={`/reports/${user.id}/print?${qs}`} target="_blank">Print view</Link>
          </div>
        </form>
      </section>
      <div className="stats">
        <Stat value={sm.daysReported} sub={sm.workingDays} label="Days reported" />
        <Stat value={hrs(sm.hours)} label="Hours logged" />
        <Stat value={sm.completed} label="Tasks completed" />
        <Stat value={sm.missing.length} label="Working days not reported" />
        <Stat value={sm.reviewed} sub={sm.tasks} label="Reviewed by PI" />
      </div>
      <div className="stack">
        {all.length === 0 ? (
          <Empty title="No entries yet">
            <p>Your daily entries and the PI&apos;s remarks will appear here.</p>
            <Link className="btn primary" href="/entry">Add today&apos;s entry</Link>
          </Empty>
        ) : sm.entries.length === 0 ? (
          <Empty title="No entries in this period"><p>Choose a wider date range.</p></Empty>
        ) : (
          <DayGroups entries={sm.entries} mode="staff" />
        )}
      </div>
    </>
  );
}
