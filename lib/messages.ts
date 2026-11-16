/** Short status messages shown after an action, keyed by the ?m= query parameter. */
export const MESSAGES: Record<string, { text: string; kind: "ok" | "warn" }> = {
  submitted: { text: "Entry submitted.", kind: "ok" },
  saved: { text: "Your changes have been saved.", kind: "ok" },
  deleted: { text: "Entry deleted.", kind: "ok" },
  locked: { text: "This entry has been reviewed by the PI and can no longer be changed.", kind: "warn" },
  nodelete: { text: "Entries the PI has already looked at can't be deleted. Edit the entry instead.", kind: "warn" },
  profile: { text: "Profile saved.", kind: "ok" },
  photo_removed: { text: "Photo removed.", kind: "ok" },
  password: { text: "Your password has been changed.", kind: "ok" },
  reviewed: { text: "Marked as reviewed.", kind: "ok" },
  revision: { text: "Revision requested.", kind: "ok" },
  needremark: { text: "Add a remark explaining what should be revised.", kind: "warn" },
  deactivated: { text: "Account deactivated. Their records are kept.", kind: "ok" },
  reactivated: { text: "Account reactivated.", kind: "ok" },
  self: { text: "You can't deactivate your own account.", kind: "warn" },
  details: { text: "Details saved.", kind: "ok" },
  signedout: { text: "You have signed out.", kind: "ok" },
};

export function withMsg(path: string, m: string): string {
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}m=${m}${hash ? "#" + hash : ""}`;
}

export function safeNext(target: unknown, fallback: string): string {
  if (typeof target === "string" && target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) {
    return target;
  }
  return fallback;
}
