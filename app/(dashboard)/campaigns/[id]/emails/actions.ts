"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";

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

  revalidatePath(`/campaigns/${campaignId}/emails`);
  return { ok: true };
}

/** Save per-contact overrides — a map of { tokenKey: stringValue }. */
export async function updateContactOverridesAction(
  campaignId: string,
  contactId: string,
  overrides: Record<string, string>,
): Promise<UpdateStrategyResult> {
  // Validate shape: flat map of string → string.
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof k !== "string" || typeof v !== "string") {
      return { ok: false, error: "Overrides must be a flat string map" };
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("contacts")
    .update({ email_overrides: overrides })
    .eq("id", contactId)
    .eq("campaign_id", campaignId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campaigns/${campaignId}/emails`);
  return { ok: true };
}
