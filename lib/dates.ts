import { LEAVE_CATEGORY, TIMEZONE, WORKING_DAYS } from "./config";
import type { Entry } from "./types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Calendar date (YYYY-MM-DD) of an instant in the configured time zone. */
export function isoInZone(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function todayISO(): string {
  return isoInZone(new Date());
}
export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function utc(s: string) {
  return new Date(s + "T00:00:00Z");
}
export function addDays(s: string, n: number): string {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(s: string): number {
  return utc(s).getUTCDay();
}
export function isWorkday(s: string): boolean {
  return WORKING_DAYS.includes(weekday(s));
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let c = from;
  for (let i = 0; c <= to && i < 1500; i++) {
    out.push(c);
    c = addDays(c, 1);
  }
  return out;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s || !isISODate(s)) return "";
  const d = utc(s);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtDay(s: string): string {
  const d = utc(s);
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtLong(s: string): string {
  const d = utc(s);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function dow(s: string): string {
  return DOW[weekday(s)];
}
export function fmtStamp(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
}
export function hrs(v: number | string | null | undefined): string {
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const PRESETS: [string, string][] = [
  ["week", "This week"],
  ["month", "This month"],
  ["last", "Last month"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
];

export function presetRange(name: string): [string, string] {
  const t = todayISO();
  if (name === "week") {
    const g = (weekday(t) + 6) % 7;
    return [addDays(t, -g), t];
  }
  if (name === "last") {
    const firstThis = t.slice(0, 8) + "01";
    const lastPrev = addDays(firstThis, -1);
    return [lastPrev.slice(0, 8) + "01", lastPrev];
  }
  if (name === "30") return [addDays(t, -29), t];
  if (name === "90") return [addDays(t, -89), t];
  return [t.slice(0, 8) + "01", t];
}

export type SearchParams = Record<string, string | string[] | undefined>;
export function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

/** Reads ?preset= or ?from=&to= ; returns [from, to, preset]. */
export function rangeFromParams(sp: SearchParams): [string, string, string] {
  const preset = param(sp, "preset");
  let from = param(sp, "from");
  let to = param(sp, "to");
  if (isISODate(from) && isISODate(to) && !preset) {
    if (from > to) [from, to] = [to, from];
    return [from, to, "custom"];
  }
  const p = PRESETS.some(([k]) => k === preset) ? preset : "month";
  const [f, t] = presetRange(p);
  return [f, t, p];
}

export function needsReview(e: Entry): boolean {
  if (!e.review_status) return true;
  return e.review_status === "revision" && !!e.reviewed_at && new Date(e.updated_at) > new Date(e.reviewed_at);
}
export function editedAfterRemark(e: Entry): boolean {
  return e.review_status === "revision" && !!e.reviewed_at && new Date(e.updated_at) > new Date(e.reviewed_at);
}
export function isLate(e: Entry): boolean {
  return isoInZone(new Date(e.created_at)) > addDays(e.date, 1);
}

export interface Summary {
  entries: Entry[];
  daysReported: number;
  leaveDays: number;
  workingDays: number;
  missing: string[];
  hours: number;
  avg: number;
  byCat: [string, number][];
  byStatus: Record<string, number>;
  tasks: number;
  completed: number;
  reviewed: number;
  revision: number;
}

export function summarize(all: Entry[], from: string, to: string): Summary {
  const entries = all.filter((e) => e.date >= from && e.date <= to);
  const dates = new Set(entries.map((e) => e.date));
  const leave = new Set(entries.filter((e) => e.category === LEAVE_CATEGORY).map((e) => e.date));
  const t = todayISO();
  const end = to < t ? to : t;
  const workdays = from <= end ? daysBetween(from, end).filter(isWorkday) : [];
  const missing = workdays.filter((d) => !dates.has(d));
  const hours = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const byCat: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const e of entries) {
    byCat[e.category] = (byCat[e.category] || 0) + (Number(e.hours) || 0);
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  }
  const reportedWorkdays = dates.size - leave.size;
  return {
    entries,
    daysReported: dates.size,
    leaveDays: leave.size,
    workingDays: workdays.length,
    missing,
    hours,
    avg: reportedWorkdays > 0 ? hours / reportedWorkdays : 0,
    byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
    byStatus,
    tasks: entries.length,
    completed: byStatus["Completed"] || 0,
    reviewed: entries.filter((e) => e.review_status === "reviewed").length,
    revision: entries.filter((e) => e.review_status === "revision").length,
  };
}

export function streak(entries: Entry[]): number {
  const have = new Set(entries.map((e) => e.date));
  let d = todayISO();
  if (!have.has(d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (isWorkday(d)) {
      if (have.has(d)) n++;
      else break;
    }
    d = addDays(d, -1);
  }
  return n;
}

export function groupByDay(entries: Entry[]): { date: string; items: Entry[]; hours: number }[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date)!.push(e);
  }
  return [...groups.keys()]
    .sort()
    .reverse()
    .map((date) => {
      const items = groups.get(date)!;
      return { date, items, hours: items.reduce((s, e) => s + (Number(e.hours) || 0), 0) };
    });
}

export function sortEntriesDesc(a: Entry, b: Entry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}
