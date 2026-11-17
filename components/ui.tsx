import Link from "next/link";
import { MESSAGES } from "@/lib/messages";
import { PRESETS, fmtDate, hrs, isISODate } from "@/lib/dates";

export function Mark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/slcr-logo.png" alt="SLCR" width={238} height={65} />;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^(mr|mrs|ms|dr|prof)\.?$/i.test(w));
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

type AvatarUser = { id: number; name: string; has_photo: boolean; photo_version: number };

export function Avatar({ user, size = "" }: { user: AvatarUser; size?: "" | "lg" | "xl" }) {
  if (user.has_photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`avatar ${size}`} src={`/photo/${user.id}?v=${user.photo_version}`} alt="" />;
  }
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}

export function Flash({ m, d }: { m?: string; d?: string }) {
  if (!m || !MESSAGES[m]) return null;
  let text = MESSAGES[m].text;
  if (m === "submitted" && d && isISODate(d)) text = `Entry submitted for ${fmtDate(d)}.`;
  return (
    <div className={`flash ${MESSAGES[m].kind}`} role="status">
      {text}
    </div>
  );
}

export function Presets({ base, current, extra = {} }: { base: string; current: string; extra?: Record<string, string | number> }) {
  return (
    <div className="presets">
      {PRESETS.map(([key, label]) => {
        const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])), preset: key });
        return (
          <Link key={key} className="btn sm" href={`${base}?${qs}`} aria-current={current === key ? "true" : "false"}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const kind = ({ Completed: "ok", "In progress": "info", Pending: "warn", Blocked: "bad" } as Record<string, string>)[status] ?? "plain";
  return <span className={`pill ${kind}`}>{status}</span>;
}

export function ReviewPill({ status }: { status: string }) {
  if (status === "reviewed") return <span className="pill ok">Reviewed</span>;
  if (status === "revision") return <span className="pill warn">Revision requested</span>;
  return <span className="pill plain">Awaiting review</span>;
}

export function Stat({ value, sub, label }: { value: React.ReactNode; sub?: React.ReactNode; label: string }) {
  return (
    <div className="stat">
      <span className="v">
        {value}
        {sub != null && <small> / {sub}</small>}
      </span>
      <span className="l">{label}</span>
    </div>
  );
}

export function CatBars({ rows }: { rows: [string, number][] }) {
  if (!rows.length) return <p className="muted">No hours in this range.</p>;
  const top = Math.max(...rows.map((r) => r[1]), 0.0001);
  return (
    <div className="hbars">
      {rows.map(([k, v]) => (
        <div className="hbar" key={k}>
          <span className="k" title={k}>{k}</span>
          <span className="track">
            <span className="fill" style={{ width: `${((v / top) * 100).toFixed(1)}%` }} />
          </span>
          <span className="n">{hrs(v)} h</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
