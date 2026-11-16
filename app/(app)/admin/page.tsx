import Link from "next/link";
import { Avatar, Empty, Flash, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROSTER } from "@/lib/config";
import { entriesFor, staffUsers } from "@/lib/data";
import {
  addDays, fmtDate, fmtDay, fmtLong, hrs, isWorkday, needsReview, param, presetRange, streak, summarize, todayISO,
  type SearchParams,
} from "@/lib/dates";

export const metadata = { title: "Team overview" };

export default async function AdminOverview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const staff = await staffUsers();
  const t = todayISO();
  const [wFrom, wTo] = presetRange("week");
  const [mFrom, mTo] = presetRange("month");
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  let reportedToday = 0, weekEntries = 0, monthHours = 0, pending = 0;
  const cards = await Promise.all(
    staff.map(async (u) => {
      const es = await entriesFor(u.id);
      const dates = new Set(es.map((e) => e.date));
      const sm = summarize(es, mFrom, mTo);
      const done = dates.has(t);
      reportedToday += done ? 1 : 0;
      weekEntries += es.filter((e) => e.date >= wFrom && e.date <= wTo).length;
      monthHours += sm.hours;
      pending += es.filter(needsReview).length;
      return { u, last: es[0], sm, done, streak: streak(es), strip: last14.map((d) => [d, dates.has(d)] as const) };
    }),
  );
  const allNames = new Set((await staffUsers(true)).map((u) => u.name.trim().toLowerCase()));
  const waiting = ROSTER.filter((r) => !allNames.has(r.name.toLowerCase()));

  return (
    <>
      <Flash m={param(sp, "m")} />
      <section className="page-head">
        <div>
          <p className="eyebrow">Team overview</p>
          <h1>{fmtLong(t)}</h1>
        </div>
      </section>
      <div className="stats">
        <Stat value={staff.length} label="Active staff" />
        <Stat value={reportedToday} sub={staff.length} label="Reported today" />
        <Stat value={weekEntries} label="Entries this week" />
        <Stat value={hrs(monthHours)} label="Hours logged this month" />
        <Link className="stat" href="/admin/log?preset=90&review=pending" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="v">{pending}</span>
          <span className="l">Entries awaiting your review</span>
        </Link>
      </div>
      <section className="stack">
        <div className="panel-head" style={{ margin: 0 }}>
          <h2>Project staff</h2>
          <span className="muted small">Select a person to open their progress log.</span>
        </div>
        {cards.length ? (
          <div className="cards">
            {cards.map((c) => (
              <Link key={c.u.id} className="scard" href={`/admin/log?uid=${c.u.id}&preset=month`}>
                <div className="scard-top">
                  <Avatar user={c.u} size="lg" />
                  <div>
                    <div className="nm">{c.u.name}</div>
                    <div className="muted small">{c.u.designation}{c.u.emp_code ? ` · ${c.u.emp_code}` : ""}</div>
                  </div>
                </div>
                <div>
                  {c.done ? <span className="pill ok">Reported today</span>
                    : isWorkday(t) ? <span className="pill warn">Not reported today</span>
                    : <span className="pill plain">Non-working day</span>}
                </div>
                <div className="kv">
                  <span>Last entry</span><span>{c.last ? fmtDate(c.last.date) : "—"}</span>
                  <span>Hours this month</span><span>{hrs(c.sm.hours)}</span>
                  <span>Days reported this month</span><span>{c.sm.daysReported} / {c.sm.workingDays}</span>
                  <span>Current streak</span><span>{c.streak} {c.streak === 1 ? "day" : "days"}</span>
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="muted small">Last 14 days</span>
                  <div className="strip">
                    {c.strip.map(([d, on]) => (
                      <i key={d} className={on ? "on" : isWorkday(d) ? "" : "off"} title={`${fmtDay(d)}${on ? " · reported" : ""}`} />
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No staff accounts yet">
            <p>Create an account for each staff member under Staff accounts, then give them their username and temporary password.</p>
            <Link className="btn primary" href="/admin/staff">Add staff accounts</Link>
          </Empty>
        )}
      </section>
      {waiting.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Roster members without an account</h2>
            <Link className="btn sm" href="/admin/staff">Add accounts</Link>
          </div>
          <ul className="roster">
            {waiting.map((r) => (
              <li key={r.username}>
                <span>{r.name}<br /><span className="muted small">{r.designation}</span></span>
                <span className="pill plain">No account</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
