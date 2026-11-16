import Link from "next/link";
import { DailyChart } from "@/components/chart";
import { DayGroups } from "@/components/entries";
import { CatBars, Empty, Flash, Presets } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { CATEGORIES, STATUSES } from "@/lib/config";
import { publicUser, staffUsers } from "@/lib/data";
import { getEntriesInRange } from "@/lib/filedb";
import { hrs, needsReview, param, rangeFromParams, sortEntriesDesc, type SearchParams } from "@/lib/dates";
import type { Entry } from "@/lib/types";

export const metadata = { title: "Progress log" };

export default async function AdminLog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [from, to, preset] = rangeFromParams(sp);
  const uid = Number(param(sp, "uid")) || 0;
  const cat = param(sp, "cat") || "all";
  const status = param(sp, "status") || "all";
  const review = param(sp, "review") || "all";
  const openReview = Number(param(sp, "review_open")) || undefined;

  const staff = await staffUsers(true);
  const owners = new Map(staff.map((u) => [u.id, publicUser(u)]));
  let rows = await getEntriesInRange(from, to);
  rows = rows.filter((r) =>
    owners.has(r.user_id) &&
    (!uid || r.user_id === uid) &&
    (!CATEGORIES.includes(cat) || r.category === cat) &&
    (!STATUSES.includes(status) || r.status === status) &&
    (review !== "reviewed" && review !== "revision" || r.review_status === review),
  ).sort(sortEntriesDesc);
  if (review === "pending") rows = rows.filter(needsReview);

  const hours = rows.reduce((s, r) => s + Number(r.hours), 0);
  const byCat: Record<string, number> = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + Number(r.hours);

  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k !== "review_open" && k !== "m" && typeof v === "string") keep.set(k, v);
  }
  const nextUrl = `/admin/log${keep.size ? "?" + keep.toString() : ""}`;
  const person = uid ? owners.get(uid) : undefined;
  const extra: Record<string, string | number> = { uid, cat, status, review };

  return (
    <>
      <Flash m={param(sp, "m")} />
      <section className="page-head">
        <div>
          <p className="eyebrow">Progress log</p>
          <h1>{person ? person.name : "All staff"}</h1>
        </div>
        {person && <Link className="btn" href={`/admin/reports?uid=${uid}&from=${from}&to=${to}`}>Build report for this period</Link>}
      </section>
      <section className="panel stack">
        <Presets base="/admin/log" current={preset} extra={extra} />
        <form className="filters" method="get">
          <label htmlFor="uid">Staff member
            <select id="uid" name="uid" defaultValue={String(uid)}>
              <option value="0">All staff</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (inactive)"}</option>)}
            </select>
          </label>
          <label htmlFor="from">From<input type="date" id="from" name="from" defaultValue={from} /></label>
          <label htmlFor="to">To<input type="date" id="to" name="to" defaultValue={to} /></label>
          <label htmlFor="cat">Work category
            <select id="cat" name="cat" defaultValue={cat}><option value="all">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label htmlFor="status">Task status
            <select id="status" name="status" defaultValue={status}><option value="all">All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label htmlFor="review">Review
            <select id="review" name="review" defaultValue={review}>
              <option value="all">All</option>
              <option value="pending">Awaiting review</option>
              <option value="reviewed">Reviewed</option>
              <option value="revision">Revision requested</option>
            </select>
          </label>
          <div className="actions"><button className="btn primary">Apply filters</button></div>
        </form>
      </section>
      {rows.length ? (
        <>
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <h2>Hours per day</h2>
                <span className="muted small mono">{hrs(hours)} h · {rows.length} entries</span>
              </div>
              <DailyChart entries={rows} from={from} to={to} />
              <p className="muted small">Lighter bars are non-working days.</p>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Hours by work category</h2></div>
              <CatBars rows={Object.entries(byCat).sort((a, b) => b[1] - a[1])} />
            </section>
          </div>
          <div className="stack">
            <DayGroups entries={rows} mode="admin" owners={owners} showOwner={!uid} nextUrl={nextUrl} openReview={openReview} />
          </div>
        </>
      ) : !staff.length ? (
        <Empty title="No staff accounts yet"><p>Entries appear here once staff start logging their daily progress.</p></Empty>
      ) : (
        <Empty title="No entries match these filters"><p>Widen the date range or set the filters back to All.</p></Empty>
      )}
    </>
  );
}
