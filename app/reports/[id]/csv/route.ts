import { buildCsv, reportFilename, reportTarget } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await reportTarget((await params).id, new URL(req.url));
  if (!t) return new Response("Not found", { status: 404 });
  return new Response(buildCsv(t.user, t.sm), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFilename(t.user, t.from, t.to, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
}
