import { start, getRun } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { launchCampaignWorkflow } from "@/workflows/launch-campaign";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  console.log("[sequence:api] POST launch", { campaignId: id });

  const run = await start(launchCampaignWorkflow, [id]);
  const supabase = getSupabaseAdmin();
  await supabase
    .from("campaigns")
    .update({ launch_run_id: run.runId })
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
