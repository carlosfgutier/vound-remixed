import { generateEnrichmentReport } from "@/lib/enrichment/generate-report";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const result = await generateEnrichmentReport(id);
  if (!result.ready) {
    return Response.json({ error: result.reason }, { status: 409 });
  }
  return Response.json({ markdown: result.markdown });
}
