import Link from "next/link";
import { deleteEntryAction, reviewAction } from "@/app/actions";
import { editedAfterRemark, fmtDay, fmtStamp, groupByDay, hrs, isLate } from "@/lib/dates";
import type { Entry, PublicUser } from "@/lib/types";
import { Avatar, ReviewPill, StatusPill } from "./ui";
import { SubmitButton } from "./forms";

type Mode = "admin" | "staff" | "readonly";

interface CardProps {
  e: Entry;
  mode: Mode;
  owner?: PublicUser;
  showOwner?: boolean;
  nextUrl?: string;
  openReview?: number;
}

export function EntryCard({ e, mode, owner, showOwner, nextUrl = "", openReview }: CardProps) {
  const anchor = `#entry-${e.id}`;
  return (
    <article className="entry" id={`entry-${e.id}`}>
      <div className="entry-top">
        <div className="left">
          {showOwner && owner ? (
            <>
              <Avatar user={owner} />
              <div>
                <div className="entry-title">{e.title}</div>
                <div className="muted small">{owner.name}</div>
              </div>
            </>
          ) : (
            <div className="entry-title">{e.title}</div>
          )}
        </div>
        <div className="row">
          <StatusPill status={e.status} />
          <ReviewPill status={e.review_status} />
        </div>
      </div>
      <div className="entry-meta">
        <span className="chip">{e.category}</span>
        <span>{e.location}</span>
        <span>·</span>
        <span className="mono">{hrs(e.hours)} h</span>
        {isLate(e) && (
          <>
            <span>·</span>
            <span className="pill warn">Logged late</span>
          </>
        )}
        <span>·</span>
        <span>Logged {fmtStamp(e.created_at)}</span>
      </div>
      <dl>
        <dt>Work done</dt>
        <dd>{e.work}</dd>
        {e.outputs && (<><dt>Outputs</dt><dd>{e.outputs}</dd></>)}
        {e.next_plan && (<><dt>Plan for next day</dt><dd>{e.next_plan}</dd></>)}
        {e.issues && (<><dt>Issues / support</dt><dd>{e.issues}</dd></>)}
      </dl>
      {e.review_status && (
        <div className={`review ${e.review_status === "reviewed" ? "ok" : "warn"}`}>
          <div className="row">
            <strong>PI review</strong>
            <ReviewPill status={e.review_status} />
            <span className="muted small">{fmtStamp(e.reviewed_at)}</span>
            {editedAfterRemark(e) && <span className="pill info">Edited after remark</span>}
          </div>
          {e.review_remark && <div className="txt">{e.review_remark}</div>}
        </div>
      )}

      {mode === "admin" &&
        (openReview === e.id ? (
          <form action={reviewAction} className="stack">
            <input type="hidden" name="entry_id" value={e.id} />
            <input type="hidden" name="next" value={nextUrl + anchor} />
            <label htmlFor={`remark-${e.id}`}>
              Remark for {owner?.name ?? "staff member"}
              <textarea id={`remark-${e.id}`} name="remark" rows={3} defaultValue={e.review_remark}
                placeholder="Feedback, instructions or corrections" autoFocus />
            </label>
            <div className="actions">
              <SubmitButton className="btn primary sm" name="decision" value="reviewed">Mark reviewed</SubmitButton>
              <SubmitButton className="btn sm" name="decision" value="revision">Request revision</SubmitButton>
              <Link className="btn sm" href={nextUrl + anchor}>Cancel</Link>
            </div>
          </form>
        ) : (
          <div className="actions">
            {e.review_status !== "reviewed" && (
              <form action={reviewAction} className="inline">
                <input type="hidden" name="entry_id" value={e.id} />
                <input type="hidden" name="next" value={nextUrl + anchor} />
                <input type="hidden" name="decision" value="reviewed" />
                <SubmitButton className="btn sm primary">Mark reviewed</SubmitButton>
              </form>
            )}
            <Link className="btn sm" href={`${nextUrl}${nextUrl.includes("?") ? "&" : "?"}review_open=${e.id}${anchor}`}>
              {e.review_remark ? "Edit remark" : "Add remark"}
            </Link>
          </div>
        ))}

      {mode === "staff" &&
        (e.review_status === "reviewed" ? (
          <p className="muted small">Reviewed entries are locked.</p>
        ) : (
          <div className="actions">
            <Link className="btn sm" href={`/entry/${e.id}/edit`}>Edit</Link>
            {!e.review_status && (
              <details className="confirm">
                <summary className="btn sm danger">Delete</summary>
                <form action={deleteEntryAction} className="confirm-box">
                  <input type="hidden" name="entry_id" value={e.id} />
                  Delete this entry permanently?
                  <SubmitButton className="btn sm danger">Delete</SubmitButton>
                </form>
              </details>
            )}
          </div>
        ))}
    </article>
  );
}

export function DayGroups({ entries, mode, owners, showOwner, nextUrl, openReview }: {
  entries: Entry[];
  mode: Mode;
  owners?: Map<number, PublicUser>;
  showOwner?: boolean;
  nextUrl?: string;
  openReview?: number;
}) {
  return (
    <>
      {groupByDay(entries).map((g) => (
        <section className="daygroup" key={g.date}>
          <div className="dayhead">
            <h3>{fmtDay(g.date)}</h3>
            <span className="muted small mono">
              {g.items.length} {g.items.length === 1 ? "entry" : "entries"} · {hrs(g.hours)} h
            </span>
          </div>
          {g.items.map((e) => (
            <EntryCard key={e.id} e={e} mode={mode} owner={owners?.get(e.user_id)} showOwner={showOwner}
              nextUrl={nextUrl} openReview={openReview} />
          ))}
        </section>
      ))}
    </>
  );
}
