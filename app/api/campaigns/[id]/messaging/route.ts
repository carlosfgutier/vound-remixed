import { start, getRun } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateEmailStrategyWorkflow } from "@/workflows/generate-email-strategy";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;

  const run = await start(generateEmailStrategyWorkflow, [id]);

  const supabase = getSupabaseAdmin();
  await supabase
    .from("campaigns")
    .update({ strategy_run_id: run.runId })
    .eq("id", id);

  return Response.json({ runId: run.runId });
}

export async function GET(req: Request, { params }: Params) {
  const { id: _campaignId } = await params;
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  const run = getRun(runId);
  if (!(await run.exists)) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }

  const readable = run.getReadable();
  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
