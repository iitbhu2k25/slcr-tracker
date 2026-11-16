"""PDF and CSV builders for staff progress reports."""
import csv
import datetime as dt
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

import config

TEAL = colors.HexColor("#0d6a7c")
INK = colors.HexColor("#13242b")
MUTED = colors.HexColor("#56676f")
LINE = colors.HexColor("#d5dfe3")


def _hrs(v):
    v = round(float(v or 0), 1)
    return str(int(v)) if v == int(v) else f"{v:.1f}"


def _fdate(value):
    d = value if isinstance(value, dt.date) else dt.date.fromisoformat(value)
    return f"{d.day} {d.strftime('%b %Y')}"


def _txt(s):
    """Escape for ReportLab paragraphs and keep line breaks."""
    return escape(str(s or "")).replace("\n", "<br/>")


def build_pdf(user, frm, to, sm, photo_path=None):
    buf = io.BytesIO()
    W, H = A4
    margin = 14 * mm

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(TEAL)
        canvas.rect(0, H - 30 * mm, W, 30 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 13.5)
        canvas.drawString(margin, H - 11.5 * mm, config.LAB)
        canvas.setFont("Helvetica", 9.5)
        canvas.drawString(margin, H - 17.5 * mm, config.INSTITUTE)
        canvas.drawString(margin, H - 23.5 * mm, "Project: " + config.PROJECT)
        canvas.setFont("Helvetica-Bold", 10.5)
        canvas.drawRightString(W - margin, H - 11.5 * mm, "PROGRESS REPORT")
        canvas.setFont("Helvetica", 8.5)
        canvas.drawRightString(W - margin, H - 17.5 * mm, f"{_fdate(frm)}  to  {_fdate(to)}")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(margin, 9 * mm, f"{config.LAB} - {user['name']}")
        canvas.drawRightString(W - margin, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=margin, rightMargin=margin,
                            topMargin=36 * mm, bottomMargin=16 * mm,
                            title=f"Progress report - {user['name']}", author=config.LAB)
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=INK)
    small = ParagraphStyle("s", parent=body, fontSize=7.5, textColor=MUTED)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11,
                        textColor=INK, spaceBefore=8, spaceAfter=4)
    name = ParagraphStyle("n", parent=body, fontName="Helvetica-Bold", fontSize=14, leading=18)
    lbl = ParagraphStyle("l", parent=body, fontSize=9.5, leading=13, textColor=MUTED)
    val = ParagraphStyle("v", parent=body, fontSize=9.5, leading=13)
    num = ParagraphStyle("num", parent=body, alignment=TA_RIGHT)

    story = []
    info_rows = [[Paragraph(_txt(user["name"]), name), ""]]
    for k, v in [("Designation", user["designation"] or "-"),
                 ("Employee / project ID", user["emp_code"] or "-"),
                 ("Joined project", _fdate(user["joined_on"]) if user["joined_on"] else "-"),
                 ("Reporting period", f"{_fdate(frm)} to {_fdate(to)}"),
                 ("Report generated", dt.datetime.now().strftime("%d %b %Y, %H:%M").lstrip("0"))]:
        info_rows.append([Paragraph(k, lbl), Paragraph(_txt(v), val)])
    info = Table(info_rows, colWidths=[44 * mm, 90 * mm])
    info.setStyle(TableStyle([("SPAN", (0, 0), (1, 0)), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    photo = ""
    if photo_path:
        try:
            photo = Image(photo_path, width=30 * mm, height=30 * mm)
        except Exception:
            photo = ""
    head = Table([[info, photo]], colWidths=[W - 2 * margin - 32 * mm, 32 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 4 * mm)]

    grid = TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                       ("TEXTCOLOR", (0, 0), (-1, -1), INK), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                       ("ALIGN", (3, 0), (3, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 3),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 3)])
    story.append(Paragraph("Summary", h2))
    t = Table([
        ["Working days (up to today)", sm["working_days"], "Total hours logged", _hrs(sm["hours"])],
        ["Days with a progress entry", sm["days_reported"], "Avg. hours per reported working day", _hrs(sm["avg"])],
        ["Days on leave", sm["leave_days"], "Task entries", sm["tasks"]],
        ["Working days not reported", len(sm["missing"]), "Tasks completed", sm["completed"]],
        ["Entries reviewed by PI", f"{sm['reviewed']} / {sm['tasks']}", "Revision requested", sm["revision"]],
    ], colWidths=[62 * mm, 24 * mm, 72 * mm, 24 * mm], hAlign="LEFT")
    t.setStyle(grid)
    story.append(t)

    head_style = [("BACKGROUND", (0, 0), (-1, 0), TEAL), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                  ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5)]
    if sm["by_cat"]:
        story.append(Paragraph("Hours by work category", h2))
        rows = [["Category", "Hours", "Share"]] + [
            [k, _hrs(v), f"{round(v / sm['hours'] * 100)}%" if sm["hours"] else "-"] for k, v in sm["by_cat"]]
        t = Table(rows, colWidths=[122 * mm, 30 * mm, 30 * mm], repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
                               ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                               ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f6f7")])]
                              + head_style))
        story.append(t)

    if sm["missing"]:
        story.append(Paragraph("Working days without an entry", h2))
        story.append(Paragraph(", ".join(_fdate(d) for d in sm["missing"]), small))

    story.append(Paragraph("Daily progress entries", h2))
    rows = [["Date", "Category", "Work carried out", "Hrs", "Status", "PI review"]]
    for e in sorted(sm["entries"], key=lambda e: (e["date"], e["created_at"])):
        work = f"<b>{_txt(e['title'])}</b><br/>{_txt(e['work'])}"
        if e["outputs"]:
            work += f"<br/><i>Outputs:</i> {_txt(e['outputs'])}"
        if e["next_plan"]:
            work += f"<br/><i>Next:</i> {_txt(e['next_plan'])}"
        if e["issues"]:
            work += f"<br/><i>Issues:</i> {_txt(e['issues'])}"
        rv = {"reviewed": "Reviewed", "revision": "Revision requested"}.get(e["review_status"], "Not reviewed")
        if e["review_remark"]:
            rv += f"<br/>{_txt(e['review_remark'])}"
        d = dt.date.fromisoformat(e["date"])
        rows.append([Paragraph(f"{_fdate(d)}<br/>{d.strftime('%a')}", body),
                     Paragraph(f"{_txt(e['category'])}<br/><font color='#56676f'>{_txt(e['location'])}</font>", body),
                     Paragraph(work, body), Paragraph(_hrs(e["hours"]), num),
                     Paragraph(_txt(e["status"]), body), Paragraph(rv, body)])
    if len(rows) == 1:
        rows.append(["-", "-", Paragraph("No entries in this period.", body), "-", "-", "-"])
    t = Table(rows, colWidths=[19 * mm, 30 * mm, 71 * mm, 10 * mm, 18 * mm, 34 * mm], repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
                          + head_style))
    story.append(t)

    sig = Table([["", "", ""],
                 [Paragraph(f"Signature of employee<br/>{_txt(user['name'])}", val), "",
                  Paragraph("Signature of Principal Investigator<br/>Date: ______________", val)]],
                colWidths=[62 * mm, None, 62 * mm], rowHeights=[18 * mm, None])
    sig.setStyle(TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.7, MUTED), ("LINEBELOW", (2, 0), (2, 0), 0.7, MUTED),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [Spacer(1, 8 * mm), KeepTogether(sig)]

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


def build_csv(user, sm):
    out = io.StringIO()
    out.write("﻿")  # lets Excel open UTF-8 (Hindi etc.) correctly
    w = csv.writer(out)
    w.writerow(["Staff name", "Designation", "Date", "Day", "Hours", "Category", "Location", "Task status",
                "Task title", "Work carried out", "Outputs", "Plan for next day", "Issues / support",
                "Logged at", "PI review", "PI remark"])
    for e in sorted(sm["entries"], key=lambda e: (e["date"], e["created_at"])):
        rv = {"reviewed": "Reviewed", "revision": "Revision requested"}.get(e["review_status"], "Not reviewed")
        w.writerow([user["name"], user["designation"], e["date"],
                    dt.date.fromisoformat(e["date"]).strftime("%a"), _hrs(e["hours"]), e["category"],
                    e["location"], e["status"], e["title"], e["work"], e["outputs"], e["next_plan"],
                    e["issues"], e["created_at"], rv, e["review_remark"]])
    return out.getvalue()
