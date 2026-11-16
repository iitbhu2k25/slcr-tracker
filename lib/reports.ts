import "server-only";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { apiUser, audit, findUserById } from "./auth";
import { INSTITUTE, LAB, PROJECT } from "./config";
import { getPhoto } from "./filedb";
import { entriesFor } from "./data";
import { dow, fmtDate, fmtStamp, hrs, rangeFromParams, summarize, type SearchParams, type Summary } from "./dates";
import type { User } from "./types";

/** Who may see whose report: admins anyone, staff only themselves. Returns null when not allowed. */
export async function reportTarget(idParam: string, url: URL) {
  const me = await apiUser();
  const id = Number(idParam);
  if (!me || !Number.isInteger(id)) return null;
  if (me.role !== "admin" && me.id !== id) return null;
  const user = await findUserById(id);
  if (!user) return null;
  const sp: SearchParams = Object.fromEntries(url.searchParams.entries());
  const [from, to] = rangeFromParams(sp);
  const sm = summarize(await entriesFor(user.id), from, to);
  return { me, user, from, to, sm };
}

export async function photoBytes(userId: number): Promise<Buffer | null> {
  return getPhoto(userId);
}

export function reportFilename(user: User, from: string, to: string, ext: string) {
  const surname = user.name.replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "").replace(/[^A-Za-z0-9]+/g, "_");
  return `Progress_Report_${surname}_${from}_to_${to}.${ext}`.replace(/_+/g, "_");
}

/** The standard PDF fonts only cover Latin text; map common punctuation and replace the rest. */
function safe(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

export function buildPdf(user: User, from: string, to: string, sm: Summary, photo: Buffer | null): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14;
  const teal: [number, number, number] = [13, 106, 124];
  const ink: [number, number, number] = [19, 36, 43];
  const muted: [number, number, number] = [86, 103, 111];
  const line: [number, number, number] = [213, 223, 227];

  const letterhead = () => {
    doc.setFillColor(...teal);
    doc.rect(0, 0, W, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(13.5).text(LAB, M, 11.5);
    doc.setFont("helvetica", "normal").setFontSize(9.5).text(INSTITUTE, M, 17.5).text(`Project: ${PROJECT}`, M, 23.5);
    doc.setFont("helvetica", "bold").setFontSize(10.5).text("PROGRESS REPORT", W - M, 11.5, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8.5).text(`${fmtDate(from)}  to  ${fmtDate(to)}`, W - M, 17.5, { align: "right" });
  };
  letterhead();

  let y = 40;
  if (photo) {
    try {
      doc.addImage(`data:image/jpeg;base64,${photo.toString("base64")}`, "JPEG", W - M - 30, y - 4, 30, 30);
      doc.setDrawColor(...line).rect(W - M - 30, y - 4, 30, 30);
    } catch {
      /* skip an unreadable photo */
    }
  }
  doc.setTextColor(...ink).setFont("helvetica", "bold").setFontSize(14).text(safe(user.name), M, y);
  doc.setFont("helvetica", "normal").setFontSize(10);
  const info: [string, string][] = [
    ["Designation", user.designation || "-"],
    ["Employee / project ID", user.emp_code || "-"],
    ["Joined project", user.joined_on ? fmtDate(user.joined_on) : "-"],
    ["Reporting period", `${fmtDate(from)} to ${fmtDate(to)}`],
    ["Report generated", fmtStamp(new Date())],
  ];
  info.forEach(([k, v], i) => {
    doc.setTextColor(...muted).text(k, M, y + 8 + i * 5.5);
    doc.setTextColor(...ink).text(safe(v), M + 44, y + 8 + i * 5.5);
  });
  y += 8 + info.length * 5.5 + 4;

  const heading = (t: string) => {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...ink).text(t, M, y);
    y += 2;
  };
  const after = () => {
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 7;
  };

  heading("Summary");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2, textColor: ink, lineColor: line },
    columnStyles: { 0: { cellWidth: 62 }, 1: { halign: "right", cellWidth: 24 }, 2: { cellWidth: 72 }, 3: { halign: "right" } },
    body: [
      ["Working days (up to today)", String(sm.workingDays), "Total hours logged", hrs(sm.hours)],
      ["Days with a progress entry", String(sm.daysReported), "Avg. hours per reported working day", hrs(sm.avg)],
      ["Days on leave", String(sm.leaveDays), "Task entries", String(sm.tasks)],
      ["Working days not reported", String(sm.missing.length), "Tasks completed", String(sm.completed)],
      ["Entries reviewed by PI", `${sm.reviewed} / ${sm.tasks}`, "Revision requested", String(sm.revision)],
    ],
  });
  after();

  if (sm.byCat.length) {
    heading("Hours by work category");
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: "striped",
      headStyles: { fillColor: teal, fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 30 } },
      head: [["Category", { content: "Hours", styles: { halign: "right" } }, { content: "Share", styles: { halign: "right" } }]],
      body: sm.byCat.map(([k, v]) => [safe(k), hrs(v), sm.hours ? `${Math.round((v / sm.hours) * 100)}%` : "-"]),
    });
    after();
  }

  if (sm.missing.length) {
    heading("Working days without an entry");
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...muted);
    const txt = doc.splitTextToSize(sm.missing.map(fmtDate).join(", "), W - 2 * M) as string[];
    doc.text(txt, M, y + 3.5);
    y += 3.5 + txt.length * 4.2 + 4;
    doc.setTextColor(...ink);
  }

  const rows = [...sm.entries]
    .sort((a, b) => (a.date === b.date ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : a.date < b.date ? -1 : 1))
    .map((e) => {
      let w = `${e.title}\n${e.work}`;
      if (e.outputs) w += `\nOutputs: ${e.outputs}`;
      if (e.next_plan) w += `\nNext: ${e.next_plan}`;
      if (e.issues) w += `\nIssues: ${e.issues}`;
      const rv = e.review_status === "reviewed" ? "Reviewed" : e.review_status === "revision" ? "Revision requested" : "Not reviewed";
      return [
        `${fmtDate(e.date)}\n${dow(e.date)}`, safe(`${e.category}\n(${e.location})`), safe(w), hrs(e.hours), safe(e.status),
        safe(e.review_remark ? `${rv}\n${e.review_remark}` : rv),
      ];
    });
  if (y > 250) { doc.addPage(); y = 40; }
  heading("Daily progress entries");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, top: 36, bottom: 18 }, theme: "grid",
    headStyles: { fillColor: teal, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.8, valign: "top", lineColor: line, textColor: ink, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 30 }, 2: { cellWidth: "auto" }, 3: { cellWidth: 11, halign: "right" }, 4: { cellWidth: 18 }, 5: { cellWidth: 34 } },
    head: [["Date", "Category", "Work carried out", "Hrs", "Status", "PI review"]],
    body: rows.length ? rows : [["-", "-", "No entries in this period", "-", "-", "-"]],
    didDrawPage: () => letterhead(),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  if (y > 270) { doc.addPage(); letterhead(); y = 60; }
  doc.setDrawColor(...muted).setTextColor(...ink).setFont("helvetica", "normal").setFontSize(9.5);
  doc.line(M, y, M + 60, y).line(W - M - 60, y, W - M, y);
  doc.text("Signature of employee", M, y + 5).text(safe(user.name), M, y + 10);
  doc.text("Signature of Principal Investigator", W - M - 60, y + 5).text("Date: ____________", W - M - 60, y + 10);

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i).setFontSize(7.5).setTextColor(...muted);
    doc.text(safe(`${LAB} - ${user.name}`), M, 289).text(`Page ${i} of ${n}`, W - M, 289, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

export function buildCsv(user: User, sm: Summary): string {
  const q = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Staff name", "Designation", "Date", "Day", "Hours", "Category", "Location", "Task status", "Task title",
    "Work carried out", "Outputs", "Plan for next day", "Issues / support", "Logged at", "PI review", "PI remark"];
  const lines = [head.map(q).join(",")];
  [...sm.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((e) => {
    const rv = e.review_status === "reviewed" ? "Reviewed" : e.review_status === "revision" ? "Revision requested" : "Not reviewed";
    lines.push([user.name, user.designation, e.date, dow(e.date), hrs(e.hours), e.category, e.location, e.status, e.title,
      e.work, e.outputs, e.next_plan, e.issues, fmtStamp(e.created_at), rv, e.review_remark].map(q).join(","));
  });
  return "﻿" + lines.join("\r\n");
}

export { audit };
