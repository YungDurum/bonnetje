// The original photo or PDF of a receipt, for "Check receipt".
import { getDb } from "@/lib/db/client";
import { getReceipt } from "@/lib/db/receipts";
import { readStoredFile } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getReceipt(await getDb(), id);
  const file = receipt?.filePath ? await readStoredFile(receipt.filePath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
