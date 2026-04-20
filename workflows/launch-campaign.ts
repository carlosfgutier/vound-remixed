import { FatalError, getWritable } from "workflow";
import { start } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendContactSequenceWorkflow } from "@/workflows/send-contact-sequence";

export type LaunchEvent =
  | { type: "start"; total: number }
  | { type: "spawned"; contactId: string; runId: string }
  | { type: "skipped"; contactId: string; reason: string }
  | { type: "done"; spawned: number; skipped: number };

type Contact = {
  id: string;
  sequence_state: string;
};

async function emit(event: LaunchEvent) {
  "use step";
  console.log("[launch] emit", event);
  const writer = getWritable<LaunchEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function loadLaunchData(
  campaignId: string,
): Promise<{ contacts: Contact[] }> {
  "use step";
  console.log("[launch] loadLaunchData", { campaignId });
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, email_strategy, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr || !campaign) throw new FatalError("Campaign not found");
  if (!campaign.email_strategy) {
    throw new FatalError("Campaign has no email strategy — run Phase 4 first");
  }

  // Only launch contacts that are enriched AND not already in a sequence.
  const { data: rows, error } = await supabase
    .from("contacts")
    .select("id, sequence_state")
    .eq("campaign_id", campaignId)
    .eq("enrichment_status", "enriched");
  if (error) throw new FatalError(error.message);

  // Flip campaign status to "running" so the UI can reflect it.
  await supabase
    .from("campaigns")
    .update({ status: "running" })
    .eq("id", campaignId);

  return {
    contacts: (rows ?? []).map((r) => ({
      id: r.id as string,
      sequence_state: r.sequence_state as string,
    })),
  };
}

async function spawnContactRun(
  campaignId: string,
  contactId: string,
): Promise<string> {
  "use step";
  console.log("[launch] spawnContactRun", { campaignId, contactId });
  const run = await start(sendContactSequenceWorkflow, [campaignId, contactId]);
  const supabase = getSupabaseAdmin();
  await supabase
    .from("contacts")
    .update({ sequence_run_id: run.runId })
    .eq("id", contactId);
  return run.runId;
}

async function finalize(campaignId: string, spawned: number) {
  "use step";
  console.log("[launch] finalize", { campaignId, spawned });
  // Status stays "running" — it only flips to "completed" when every contact's
  // sequence workflow resolves terminally, which we leave for a separate watcher
  // or the report phase to decide.
}

const CONCURRENCY = 5;

async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Launch workflow — fans out one durable `sendContactSequenceWorkflow` per
 * eligible contact. Contacts already in a terminal/active state are skipped
 * so relaunches don't double-send.
 */
export async function launchCampaignWorkflow(campaignId: string) {
  "use workflow";
  console.log("[launch] workflow:start", { campaignId });

  const { contacts } = await loadLaunchData(campaignId);
  await emit({ type: "start", total: contacts.length });

  let spawned = 0;
  let skipped = 0;

  await runBatched(contacts, CONCURRENCY, async (c) => {
    // Skip anything already active, completed, or terminal — reruns should be
    // a no-op for those.
    if (c.sequence_state !== "not_started") {
      skipped += 1;
      await emit({
        type: "skipped",
        contactId: c.id,
        reason: `state=${c.sequence_state}`,
      });
      return;
    }
    const runId = await spawnContactRun(campaignId, c.id);
    spawned += 1;
    await emit({ type: "spawned", contactId: c.id, runId });
  });

  await finalize(campaignId, spawned);
  await emit({ type: "done", spawned, skipped });

  return { campaignId, spawned, skipped };
}
