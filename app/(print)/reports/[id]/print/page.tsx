import { notFound } from "next/navigation";
import { PrintButton } from "@/components/forms";
import { apiUser, findUserById } from "@/lib/auth";
import { INSTITUTE, LAB, PROJECT } from "@/lib/config";
import { entriesFor } from "@/lib/data";
import { dow, fmtDate, fmtStamp, hrs, rangeFromParams, summarize, type SearchParams } from "@/lib/dates";
import "./print.css";

export const metadata = { title: "Progress report" };
export const dynamic = "force-dynamic";

export default async function PrintReport({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<SearchParams>;
}) {
  const me = await apiUser();
  const id = Number((await params).id);
  if (!me || !Number.isInteger(id) || (me.role !== "admin" && me.id !== id)) notFound();
  const user = await findUserById(id);
  if (!user) notFound();
  const [from, to] = rangeFromParams(await searchParams);
  const sm = summarize(await entriesFor(user.id), from, to);
  const rows = [...sm.entries].sort((a, b) =>
    a.date === b.date ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : a.date < b.date ? -1 : 1);

  return (
    <div className="print-root">
      <div className="toolbar no-print">
        <PrintButton />
        <span>Use your browser&apos;s print dialog. Choose “Save as PDF” to keep a copy.</span>
      </div>
      <div className="sheet">
        <header className="letterhead">
          <div><div className="lab">{LAB}</div><div>{INSTITUTE}</div><div>Project: {PROJECT}</div></div>
          <div className="right"><div className="doc">PROGRESS REPORT</div><div>{fmtDate(from)} to {fmtDate(to)}</div></div>
        </header>
        <section className="person">
          <table className="info">
            <tbody>
              <tr><th colSpan={2} className="name">{user.name}</th></tr>
              <tr><td>Designation</td><td>{user.designation || "-"}</td></tr>
              <tr><td>Employee / project ID</td><td>{user.emp_code || "-"}</td></tr>
              <tr><td>Joined project</td><td>{user.joined_on ? fmtDate(user.joined_on) : "-"}</td></tr>
              <tr><td>Reporting period</td><td>{fmtDate(from)} to {fmtDate(to)}</td></tr>
              <tr><td>Report generated</td><td>{fmtStamp(new Date())}</td></tr>
            </tbody>
          </table>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {user.has_photo && <img className="photo" src={`/photo/${user.id}?v=${user.photo_version}`} alt="" />}
        </section>

        <h2>Summary</h2>
        <table className="grid">
          <tbody>
            <tr><td>Working days (up to today)</td><td className="num">{sm.workingDays}</td><td>Total hours logged</td><td className="num">{hrs(sm.hours)}</td></tr>
            <tr><td>Days with a progress entry</td><td className="num">{sm.daysReported}</td><td>Avg. hours per reported working day</td><td className="num">{hrs(sm.avg)}</td></tr>
            <tr><td>Days on leave</td><td className="num">{sm.leaveDays}</td><td>Task entries</td><td className="num">{sm.tasks}</td></tr>
            <tr><td>Working days not reported</td><td className="num">{sm.missing.length}</td><td>Tasks completed</td><td className="num">{sm.completed}</td></tr>
            <tr><td>Entries reviewed by PI</td><td className="num">{sm.reviewed} / {sm.tasks}</td><td>Revision requested</td><td className="num">{sm.revision}</td></tr>
          </tbody>
        </table>

        {sm.byCat.length > 0 && (
          <>
            <h2>Hours by work category</h2>
            <table className="grid">
              <thead><tr><th>Category</th><th className="num">Hours</th><th className="num">Share</th></tr></thead>
              <tbody>
                {sm.byCat.map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="num">{hrs(v)}</td><td className="num">{sm.hours ? Math.round((v / sm.hours) * 100) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {sm.missing.length > 0 && (
          <>
            <h2>Working days without an entry</h2>
            <p className="missing">{sm.missing.map(fmtDate).join(", ")}</p>
          </>
        )}

        <h2>Daily progress entries</h2>
        <table className="grid entries">
          <thead><tr><th>Date</th><th>Category</th><th>Work carried out</th><th className="num">Hrs</th><th>Status</th><th>PI review</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>No entries in this period.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{fmtDate(e.date)}<br /><span className="muted">{dow(e.date)}</span></td>
                <td>{e.category}<br /><span className="muted">{e.location}</span></td>
                <td>
                  <strong>{e.title}</strong>
                  <div className="pre">{e.work}</div>
                  {e.outputs && <div className="pre"><em>Outputs:</em> {e.outputs}</div>}
                  {e.next_plan && <div className="pre"><em>Next:</em> {e.next_plan}</div>}
                  {e.issues && <div className="pre"><em>Issues:</em> {e.issues}</div>}
                </td>
                <td className="num">{hrs(e.hours)}</td>
                <td>{e.status}</td>
                <td>
                  {e.review_status === "reviewed" ? "Reviewed" : e.review_status === "revision" ? "Revision requested" : "Not reviewed"}
                  {e.review_remark && <div className="pre">{e.review_remark}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="signatures">
          <div><div className="line" />Signature of employee<br />{user.name}</div>
          <div><div className="line" />Signature of Principal Investigator<br />Date: ______________</div>
        </section>
        <footer className="pagefoot">{LAB} · {PROJECT}</footer>
      </div>
    </div>
  );
}
