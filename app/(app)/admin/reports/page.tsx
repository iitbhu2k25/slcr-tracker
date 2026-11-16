import Link from "next/link";
import { DayGroups } from "@/components/entries";
import { Avatar, CatBars, Empty, Presets } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { entriesFor, staffUsers } from "@/lib/data";
import { fmtDate, hrs, param, rangeFromParams, summarize, type SearchParams } from "@/lib/dates";

export const metadata = { title: "Reports" };

export default async function AdminReports({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [from, to, preset] = rangeFromParams(sp);
  const staff = await staffUsers(true);
  const uid = Number(param(sp, "uid")) || staff[0]?.id || 0;
  const user = staff.find((u) => u.id === uid);
  const sm = user ? summarize(await entriesFor(user.id), from, to) : null;
  const qs = `from=${from}&to=${to}`;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Progress report</h1>
        </div>
        <p className="muted small">Choose a staff member and period, then download a PDF to print or a CSV for spreadsheets.</p>
      </section>
      {!staff.length ? (
        <Empty title="No staff to report on yet"><p>Reports become available once staff accounts exist and entries are logged.</p></Empty>
      ) : (
        <>
          <section className="panel stack">
            <Presets base="/admin/reports" current={preset} extra={{ uid }} />
            <form className="filters" method="get">
              <label htmlFor="uid">Staff member
                <select id="uid" name="uid" defaultValue={String(uid)}>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (inactive)"}</option>)}
                </select>
              </label>
              <label htmlFor="from">From<input type="date" id="from" name="from" defaultValue={from} /></label>
              <label htmlFor="to">To<input type="date" id="to" name="to" defaultValue={to} /></label>
              <div className="actions"><button className="btn primary">Build report</button></div>
            </form>
          </section>
          {user && sm && (
            <>
              <section className="panel stack">
                <div className="panel-head" style={{ margin: 0 }}>
                  <div className="row">
                    <Avatar user={user} size="lg" />
                    <div>
                      <h2>{user.name}</h2>
                      <p className="muted small">{user.designation} · {fmtDate(from)} – {fmtDate(to)}</p>
                    </div>
                  </div>
                  <div className="actions">
                    <a className="btn primary" href={`/reports/${user.id}/pdf?${qs}`}>Download PDF</a>
                    <Link className="btn" href={`/reports/${user.id}/print?${qs}`} target="_blank">Print view</Link>
                    <a className="btn" href={`/reports/${user.id}/csv?${qs}`}>CSV</a>
                  </div>
                </div>
                <div className="split">
                  <table className="sumtable">
                    <tbody>
                      <tr><td>Working days in period (up to today)</td><td>{sm.workingDays}</td></tr>
                      <tr><td>Days with a progress entry</td><td>{sm.daysReported}</td></tr>
                      <tr><td>Days on leave</td><td>{sm.leaveDays}</td></tr>
                      <tr><td>Working days not reported</td><td>{sm.missing.length}</td></tr>
                      <tr><td>Task entries</td><td>{sm.tasks}</td></tr>
                      <tr><td>Total hours logged</td><td>{hrs(sm.hours)}</td></tr>
                      <tr><td>Average hours per reported working day</td><td>{hrs(sm.avg)}</td></tr>
                      <tr><td>Tasks completed</td><td>{sm.completed}</td></tr>
                      <tr><td>Entries reviewed by PI</td><td>{sm.reviewed} / {sm.tasks}</td></tr>
                    </tbody>
                  </table>
                  <div className="stack">
                    <h3>Hours by work category</h3>
                    <CatBars rows={sm.byCat} />
                    {sm.missing.length > 0 && (
                      <>
                        <h3>Working days not reported</h3>
                        <div className="missing">
                          {sm.missing.slice(0, 40).map((d) => <span key={d} className="chip mono">{fmtDate(d)}</span>)}
                          {sm.missing.length > 40 && <span className="muted small">and {sm.missing.length - 40} more</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
              <section className="stack">
                <h2>Entries in this report</h2>
                {sm.entries.length ? <DayGroups entries={sm.entries} mode="readonly" /> : <Empty title="No entries in this period" />}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
