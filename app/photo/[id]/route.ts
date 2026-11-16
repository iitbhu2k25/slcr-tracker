import { apiUser } from "@/lib/auth";
import { photoBytes } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A staff photo: visible to that person and to administrators only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiUser();
  const id = Number((await params).id);
  if (!me || !Number.isInteger(id) || (me.role !== "admin" && me.id !== id)) {
    return new Response("Not found", { status: 404 });
  }
  const photo = await photoBytes(id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
