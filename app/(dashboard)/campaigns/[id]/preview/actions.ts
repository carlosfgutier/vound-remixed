"use server";

import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";
import { launchCampaignWorkflow } from "@/workflows/launch-campaign";

export type UpdateStrategyResult =
  | { ok: true }
  | { ok: false; error: string };

/** Save the full campaign-level strategy (after inline edits). */
export async function updateEmailStrategyAction(
  campaignId: string,
  strategy: unknown,
): Promise<UpdateStrategyResult> {
  const parsed = emailStrategySchema.safeParse(strategy);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `${first?.path.join(".") || "strategy"}: ${first?.message || "invalid"}`,
    };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("campaigns")
    .update({ email_strategy: parsed.data satisfies EmailStrategy })
    .eq("id", campaignId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campaigns/${campaignId}/preview`);
  return { ok: true };
}

export type LaunchResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

/**
 * Kick off the launch workflow and persist the run id. The client-side caller
 * should redirect to /sequence on success.
 */
export async function launchCampaignAction(
  campaignId: string,
): Promise<LaunchResult> {
  try {
    const run = await start(launchCampaignWorkflow, [campaignId]);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("campaigns")
      .update({ launch_run_id: run.runId })
      .eq("id", campaignId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/campaigns/${campaignId}/sequence`);
    return { ok: true, runId: run.runId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Launch failed",
    };
  }
}
