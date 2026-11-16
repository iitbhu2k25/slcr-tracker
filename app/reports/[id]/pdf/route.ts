import { audit, buildPdf, photoBytes, reportFilename, reportTarget } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await reportTarget((await params).id, new URL(req.url));
  if (!t) return new Response("Not found", { status: 404 });
  const pdf = buildPdf(t.user, t.from, t.to, t.sm, await photoBytes(t.user.id));
  await audit(t.me.id, "report_pdf", `${t.user.username} ${t.from} ${t.to}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFilename(t.user, t.from, t.to, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
